"""Parallel sweep across reward / hyperparameter variants on Modal.

Each variant trains a small smoke (default 1M timesteps) on its own H100,
then runs a quick 5-episode eval. The driver aggregates results and writes
a leaderboard JSON so the user — or a downstream `scripts/oracle-orchestrate.sh`
— can pick the winning config and scale it up.

Usage (from the repo root, requires Modal credentials):
    python -m voidline_rl.sweep --grid reward --output reports/sweep-A.json

Variants are defined inline (see ``REWARD_GRID`` / ``HPARAM_GRID``). Each
variant becomes a Modal function call; ``modal.Function.map()`` fans them
out in parallel — wallclock = max(individual job).
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from itertools import product
from pathlib import Path
from typing import Any

import modal

from .modal_app import (
    CACHE_ROOT,
    REMOTE_REPO,
    cache_volume,
    image,
    models_volume,
    reports_volume,
    _base_env,
    _build_voidline_py,
)


SWEEP_APP = modal.App("voidline-balance-sweep")


@dataclass
class Variant:
    id: str
    env_vars: dict[str, str]
    train_args: list[str]


# -- Reward shape sweep (stage A) ------------------------------------------
# 16 = 4 stage-clear-bonus scales × 4 dense-reward scales. 1M timesteps each.
def reward_grid() -> list[Variant]:
    variants: list[Variant] = []
    for stage_scale in [0.5, 1.0, 5.0, 25.0]:
        for dense_scale in [0.5, 1.0, 5.0, 10.0]:
            vid = f"r{stage_scale:g}_d{dense_scale:g}"
            variants.append(
                Variant(
                    id=vid,
                    env_vars={
                        "VOIDLINE_REWARD_STAGE_SCALE": str(stage_scale),
                        "VOIDLINE_REWARD_DENSE_SCALE": str(dense_scale),
                    },
                    train_args=["--timesteps", "1000000"],
                )
            )
    return variants


# -- Hparam sweep (stage B) ------------------------------------------------
# 8 orthogonal combos sampled from a 4D grid (lr × ent_coef × gamma × n_steps).
def hparam_grid() -> list[Variant]:
    combos = [
        ("1e-4", "0.01", "0.99", "1024"),
        ("3e-4", "0.01", "0.995", "2048"),
        ("3e-4", "0.005", "0.995", "2048"),
        ("3e-4", "0.05", "0.995", "2048"),
        ("1e-3", "0.01", "0.99", "1024"),
        ("3e-4", "0.01", "0.999", "4096"),
        ("1e-4", "0.05", "0.999", "2048"),
        ("3e-4", "0.01", "0.99", "4096"),
    ]
    return [
        Variant(
            id=f"lr{lr}_e{ec}_g{g}_n{ns}",
            env_vars={
                "VOIDLINE_PPO_LR": lr,
                "VOIDLINE_PPO_ENT_COEF": ec,
                "VOIDLINE_PPO_GAMMA": g,
                "VOIDLINE_PPO_N_STEPS": ns,
            },
            train_args=["--timesteps", "1000000"],
        )
        for (lr, ec, g, ns) in combos
    ]


# -- Iter-3 multi-hypothesis sweep ----------------------------------------
# Eight orthogonal "what could break stage 1 progression" hypotheses run in
# parallel on Modal. Each variant warm-starts from /models/<hash>/oracle.zip
# (iter 2's checkpoint) so we don't re-pay the random-init burn-in cost.
def iter3_grid() -> list[Variant]:
    base = {"VOIDLINE_REWARD_STAGE_SCALE": "1.0", "VOIDLINE_REWARD_DENSE_SCALE": "1.0"}
    variants = [
        Variant(
            id="h1_bigger_stage",
            env_vars={**base, "VOIDLINE_REWARD_STAGE_SCALE": "10.0"},
            train_args=["--timesteps", "2000000"],
        ),
        Variant(
            id="h2_smaller_survival",
            env_vars={**base, "VOIDLINE_REWARD_SURVIVAL": "0.001",
                      "VOIDLINE_REWARD_STAGE_SCALE": "5.0"},
            train_args=["--timesteps", "2000000"],
        ),
        Variant(
            id="h3_force_stage1_only",
            env_vars={**base, "VOIDLINE_FORCE_START_STAGE": "1",
                      "VOIDLINE_REWARD_STAGE_SCALE": "10.0",
                      "VOIDLINE_RUNS_PER_EPISODE": "2"},
            train_args=["--timesteps", "2000000"],
        ),
        Variant(
            id="h4_force_stage3",
            env_vars={**base, "VOIDLINE_FORCE_START_STAGE": "3",
                      "VOIDLINE_REWARD_STAGE_SCALE": "10.0",
                      "VOIDLINE_RUNS_PER_EPISODE": "2"},
            train_args=["--timesteps", "2000000"],
        ),
        Variant(
            id="h5_no_death_penalty",
            env_vars={**base, "VOIDLINE_REWARD_DEATH_PENALTY": "0",
                      "VOIDLINE_REWARD_STAGE_SCALE": "10.0"},
            train_args=["--timesteps", "2000000"],
        ),
        Variant(
            id="h6_bigger_lr",
            env_vars={**base, "VOIDLINE_PPO_LR": "1e-3",
                      "VOIDLINE_REWARD_STAGE_SCALE": "10.0",
                      "VOIDLINE_PPO_ENT_COEF": "0.02"},
            train_args=["--timesteps", "2000000"],
        ),
        Variant(
            id="h7_longer_8M",
            env_vars={**base, "VOIDLINE_REWARD_STAGE_SCALE": "10.0"},
            train_args=["--timesteps", "8000000"],
        ),
        Variant(
            id="h8_short_runs_max18k",
            env_vars={**base, "VOIDLINE_MAX_STEPS_PER_RUN": "18000",
                      "VOIDLINE_REWARD_STAGE_SCALE": "10.0",
                      "VOIDLINE_RUNS_PER_EPISODE": "12"},
            train_args=["--timesteps", "2000000"],
        ),
    ]
    return variants


GRIDS = {"reward": reward_grid, "hparam": hparam_grid, "iter3": iter3_grid}


@SWEEP_APP.function(
    image=image,
    volumes={
        "/reports": reports_volume,
        "/models": models_volume,
        str(CACHE_ROOT): cache_volume,
    },
    cpu=8,
    memory=32768,
    gpu="H100",
    timeout=60 * 120,
)
def train_variant(variant_id: str, env_vars: dict, train_args: list[str]) -> dict:
    """Train a single variant on its own H100 and return summary metrics.

    Each variant gets its own ``model_dir`` under ``/models/sweep/<id>/``
    so concurrent jobs don't stomp on each other's checkpoints.
    """
    import os
    import subprocess
    from pathlib import Path

    model_dir = Path("/models/sweep") / variant_id
    model_dir.mkdir(parents=True, exist_ok=True)

    env = _base_env(model_dir)
    env.update(env_vars)
    _build_voidline_py(env)

    argv = [
        "python3",
        "-m",
        "voidline_rl.train",
        "--persona",
        "all",
        "--model-dir",
        str(model_dir),
        *train_args,
    ]
    log_path = model_dir / "train.log"
    with log_path.open("w", encoding="utf-8") as log:
        proc = subprocess.run(
            argv, cwd=REMOTE_REPO, env=env, stdout=log, stderr=subprocess.STDOUT
        )

    metrics = parse_train_log(log_path)
    metrics["variant_id"] = variant_id
    metrics["env_vars"] = env_vars
    metrics["train_args"] = train_args
    metrics["return_code"] = proc.returncode
    metrics["model_dir"] = str(model_dir)

    if proc.returncode != 0:
        metrics["error"] = "training subprocess failed (see train.log)"
        return metrics

    # Quick eval: 5 episodes × 5 runs to get a directional signal cheaply.
    eval_path = model_dir / "eval.json"
    eval_argv = [
        "python3",
        "-m",
        "voidline_rl.eval",
        "--repo-root",
        str(REMOTE_REPO),
        "--model-dir",
        str(model_dir),
        "--output",
        str(eval_path),
        "--mode",
        "quick",
        "--episodes",
        "5",
        "--runs-per-episode",
        "5",
        "--max-steps",
        "36000",
    ]
    eval_log = model_dir / "eval.log"
    with eval_log.open("w", encoding="utf-8") as log:
        proc = subprocess.run(
            eval_argv, cwd=REMOTE_REPO, env=env, stdout=log, stderr=subprocess.STDOUT
        )

    if proc.returncode == 0 and eval_path.exists():
        eval_data = json.loads(eval_path.read_text(encoding="utf-8"))
        oracle = eval_data.get("oracle", {})
        sc = oracle.get("stage_clears", {})
        metrics["stage1_rate"] = sc.get("stage1", {}).get("rate", 0.0)
        metrics["stage2_rate"] = sc.get("stage2", {}).get("rate", 0.0)
        metrics["stage3_rate"] = sc.get("stage3", {}).get("rate", 0.0)
        metrics["deaths_rate_per_run"] = oracle.get("deaths_rate_per_run", 1.0)
        metrics["median_runs_completed"] = oracle.get("median_runs_completed", 0.0)
        metrics["pick_rate_diversity"] = pick_rate_diversity(
            oracle.get("upgrade_pick_rates", [])
        )
    else:
        metrics["eval_error"] = "eval failed (see eval.log)"

    return metrics


def parse_train_log(path: Path) -> dict:
    """Pull final-iteration PPO metrics out of the training stdout."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return {}
    keys = {
        "explained_variance": None,
        "value_loss": None,
        "entropy_loss": None,
        "clip_fraction": None,
        "fps": None,
        "total_timesteps": None,
    }
    # The PPO logger prints rectangle blocks like "| key | value |"; pick the
    # last occurrence of each metric.
    for line in text.splitlines():
        for key in keys:
            needle = f"| {key.replace('_', ' '):<25} |"
            if line.startswith(needle) or line.startswith(f"|    {key}"):
                # Crude: split by | and take last numeric token.
                parts = [p.strip() for p in line.split("|") if p.strip()]
                if len(parts) >= 2:
                    try:
                        keys[key] = float(parts[-1])
                    except ValueError:
                        pass
    # Filter to populated keys.
    return {k: v for k, v in keys.items() if v is not None}


def pick_rate_diversity(rates: list[dict]) -> float:
    """Shannon entropy of pick rates (higher = more differentiated picks)."""
    import math

    pick_counts = [max(0, int(r.get("picks", 0))) for r in rates if r.get("picks", 0) > 0]
    total = sum(pick_counts)
    if total == 0:
        return 0.0
    probs = [c / total for c in pick_counts]
    return -sum(p * math.log(p + 1e-9) for p in probs)


def score_variant(metrics: dict) -> float:
    """Composite score that favors stage progression first, then diversity."""
    return (
        1.0 * metrics.get("stage1_rate", 0.0)
        + 3.0 * metrics.get("stage2_rate", 0.0)
        + 10.0 * metrics.get("stage3_rate", 0.0)
        + 0.1 * metrics.get("pick_rate_diversity", 0.0)
        + 0.05 * max(0.0, metrics.get("explained_variance", 0.0) or 0.0)
    )


@SWEEP_APP.local_entrypoint()
def main(grid: str = "reward", output: str = "reports/sweep.json") -> None:
    grid_fn = GRIDS.get(grid)
    if grid_fn is None:
        raise SystemExit(f"unknown grid: {grid}; available: {list(GRIDS)}")
    variants = grid_fn()
    print(f"[sweep] launching {len(variants)} variants for grid={grid}", flush=True)

    starmap_args = [(v.id, v.env_vars, v.train_args) for v in variants]
    raw_results = list(train_variant.starmap(starmap_args))

    results = sorted(raw_results, key=score_variant, reverse=True)
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "grid": grid,
                "variants": len(variants),
                "results": results,
                "best": results[0] if results else None,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"[sweep] wrote {output_path}", flush=True)
    if results:
        best = results[0]
        print(
            f"[sweep] best variant: {best.get('variant_id')} "
            f"score={score_variant(best):.3f} "
            f"stage1={best.get('stage1_rate')} "
            f"stage3={best.get('stage3_rate')}",
            flush=True,
        )


if __name__ == "__main__":
    main()
