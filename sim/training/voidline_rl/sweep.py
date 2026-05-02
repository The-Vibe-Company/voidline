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
    # Path inside the Modal /models volume to copy as the warm-start
    # ``oracle.zip`` before training runs. None = random init. Used by
    # the curriculum grids so each stage reliably picks up where the
    # previous one left off.
    base_checkpoint: str | None = None
    # Per-mode max_steps for the variant's quick eval (so curriculum
    # stage 2/3 evals can actually observe their boss).
    eval_max_steps: int = 46800


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


# -- Curriculum grids ------------------------------------------------------
# Each curriculum stage warm-starts from the previous stage's top-1
# checkpoint. Population = 8 variants per stage (seed perturbations + small
# reward shape variations) so we keep variance across the leaderboard low.
#
# Game-time horizons:
#   stage 1 boss spawns @ 600s   → 46800 frames + buffer
#   stage 2 boss spawns @ 1560s  → 93600 frames
#   stage 3 boss spawns @ 2340s  → 140400 frames

CURRICULUM_STAGE1_BASE = "{balance_hash}/oracle.zip"
CURRICULUM_STAGE2_BASE = "curriculum/stage1/best.zip"
CURRICULUM_STAGE3_BASE = "curriculum/stage2/best.zip"


def easy_stage1_grid() -> list[Variant]:
    """Lower-density bootstrap. The agent has 3x fewer enemies during
    training so it can survive long enough to discover stage clears.
    Once a baseline policy exists at low density, transfer it back to
    full density via curriculum_stage1.
    """
    variants: list[Variant] = []
    seeds = [1109, 2202, 3304, 4406, 5508, 6610, 7712, 8814]
    density_scales = [0.33, 0.33, 0.33, 0.33, 0.5, 0.5, 0.5, 0.5]
    stage_scales = [10.0, 25.0, 10.0, 25.0, 10.0, 25.0, 10.0, 25.0]
    for seed, density_scale, stage_scale in zip(seeds, density_scales, stage_scales):
        variants.append(
            Variant(
                id=f"easy_seed{seed}_d{density_scale:g}_s{stage_scale:g}",
                env_vars={
                    "VOIDLINE_FORCE_START_STAGE": "1",
                    "VOIDLINE_MAX_STEPS_PER_RUN": "46800",
                    "VOIDLINE_RUNS_PER_EPISODE": "4",
                    "VOIDLINE_TRAINING_DENSITY_MULT": str(density_scale),
                    "VOIDLINE_REWARD_STAGE_SCALE": str(stage_scale),
                    "VOIDLINE_REWARD_DENSE_SCALE": "1.0",
                    "VOIDLINE_PPO_N_ENVS": "8",
                },
                train_args=["--timesteps", "1000000", "--seed", str(seed)],
                base_checkpoint=None,  # fresh init at low density
                eval_max_steps=46800,
            )
        )
    return variants


def transfer_stage1_grid() -> list[Variant]:
    """Density ramp from the easy_stage1 winner to full game density.

    The easy_stage1 sweep produced a checkpoint that clears stage 1 at
    d=0.33. We now warm-start from that and continue training at higher
    densities so the policy generalizes back to the prod env. 8 variants
    spanning d ∈ {0.5, 0.66, 0.85, 1.0} × 2 stage_scales.
    """
    variants: list[Variant] = []
    base = "curriculum/stage1_easy/best.zip"
    densities = [0.5, 0.5, 0.66, 0.66, 0.85, 0.85, 1.0, 1.0]
    stage_scales = [10.0, 25.0, 10.0, 25.0, 10.0, 25.0, 10.0, 25.0]
    seeds = [1109, 2202, 3304, 4406, 5508, 6610, 7712, 8814]
    for seed, density, stage_scale in zip(seeds, densities, stage_scales):
        variants.append(
            Variant(
                id=f"xfer_s{seed}_d{density:g}_s{stage_scale:g}",
                env_vars={
                    "VOIDLINE_FORCE_START_STAGE": "1",
                    "VOIDLINE_MAX_STEPS_PER_RUN": "46800",
                    "VOIDLINE_RUNS_PER_EPISODE": "4",
                    "VOIDLINE_TRAINING_DENSITY_MULT": str(density),
                    "VOIDLINE_REWARD_STAGE_SCALE": str(stage_scale),
                    "VOIDLINE_REWARD_DENSE_SCALE": "1.0",
                    "VOIDLINE_PPO_N_ENVS": "8",
                },
                train_args=["--timesteps", "1500000", "--seed", str(seed)],
                base_checkpoint=base,
                eval_max_steps=46800,
            )
        )
    return variants


def curriculum_stage1_grid() -> list[Variant]:
    variants: list[Variant] = []
    seed_pairs = [(s, s + 1) for s in (1109, 2202, 3304, 4406)]
    stage_scales = [1.0, 5.0, 10.0]
    for idx, ((seed_a, _seed_b), stage_scale) in enumerate(
        zip(seed_pairs * 2, stage_scales * 3)
    ):
        if idx >= 8:
            break
        variants.append(
            Variant(
                id=f"s1_seed{seed_a}_stage{stage_scale:g}",
                env_vars={
                    "VOIDLINE_FORCE_START_STAGE": "1",
                    "VOIDLINE_MAX_STEPS_PER_RUN": "46800",
                    "VOIDLINE_RUNS_PER_EPISODE": "4",
                    "VOIDLINE_REWARD_STAGE_SCALE": str(stage_scale),
                    "VOIDLINE_REWARD_DENSE_SCALE": "1.0",
                    "VOIDLINE_PPO_N_ENVS": "8",
                },
                train_args=["--timesteps", "500000", "--seed", str(seed_a)],
                base_checkpoint=CURRICULUM_STAGE1_BASE,
                eval_max_steps=46800,
            )
        )
    return variants


def curriculum_stage2_grid() -> list[Variant]:
    variants: list[Variant] = []
    seeds = [1109, 2202, 3304, 4406, 5508, 6610, 7712, 8814]
    for idx, seed in enumerate(seeds):
        # Alternate stage_scale to encourage diversity in the population.
        stage_scale = 5.0 if idx % 2 == 0 else 10.0
        variants.append(
            Variant(
                id=f"s2_seed{seed}_stage{stage_scale:g}",
                env_vars={
                    "VOIDLINE_FORCE_START_STAGE": "2",
                    "VOIDLINE_MAX_STEPS_PER_RUN": "93600",
                    "VOIDLINE_RUNS_PER_EPISODE": "2",
                    "VOIDLINE_REWARD_STAGE_SCALE": str(stage_scale),
                    "VOIDLINE_REWARD_DENSE_SCALE": "1.0",
                    "VOIDLINE_PPO_N_ENVS": "8",
                },
                train_args=["--timesteps", "1000000", "--seed", str(seed)],
                base_checkpoint=CURRICULUM_STAGE2_BASE,
                eval_max_steps=93600,
            )
        )
    return variants


def curriculum_stage3_grid() -> list[Variant]:
    variants: list[Variant] = []
    seeds = [1109, 2202, 3304, 4406, 5508, 6610, 7712, 8814]
    for idx, seed in enumerate(seeds):
        stage_scale = 10.0 if idx < 4 else 5.0
        variants.append(
            Variant(
                id=f"s3_seed{seed}_stage{stage_scale:g}",
                env_vars={
                    "VOIDLINE_FORCE_START_STAGE": "3",
                    "VOIDLINE_MAX_STEPS_PER_RUN": "140400",
                    "VOIDLINE_RUNS_PER_EPISODE": "2",
                    "VOIDLINE_REWARD_STAGE_SCALE": str(stage_scale),
                    "VOIDLINE_REWARD_DENSE_SCALE": "1.0",
                    "VOIDLINE_PPO_N_ENVS": "8",
                },
                train_args=["--timesteps", "2000000", "--seed", str(seed)],
                base_checkpoint=CURRICULUM_STAGE3_BASE,
                eval_max_steps=140400,
            )
        )
    return variants


GRIDS = {
    "reward": reward_grid,
    "hparam": hparam_grid,
    "iter3": iter3_grid,
    "easy_stage1": easy_stage1_grid,
    "transfer_stage1": transfer_stage1_grid,
    "curriculum_stage1": curriculum_stage1_grid,
    "curriculum_stage2": curriculum_stage2_grid,
    "curriculum_stage3": curriculum_stage3_grid,
}


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
def train_variant(
    variant_id: str,
    env_vars: dict,
    train_args: list[str],
    base_checkpoint: str | None = None,
    eval_max_steps: int = 46800,
    balance_hash: str = "",
) -> dict:
    """Train a single variant on its own H100 and return summary metrics.

    Each variant gets its own ``model_dir`` under ``/models/sweep/<id>/``
    so concurrent jobs don't stomp on each other's checkpoints. When
    ``base_checkpoint`` is set, the named ``oracle.zip`` is copied into
    the variant dir before training so train.py's automatic warm-start
    picks it up. Provenance is stored in ``provenance.json`` for audit.
    """
    import shutil
    import subprocess
    from pathlib import Path

    model_dir = Path("/models/sweep") / variant_id
    # Wipe any leftover state from a prior run with the same variant id;
    # otherwise warm-start would pick up a stale checkpoint that no
    # longer reflects the intended base lineage.
    if model_dir.exists():
        shutil.rmtree(model_dir)
    model_dir.mkdir(parents=True, exist_ok=True)

    env = _base_env(model_dir)
    env.update(env_vars)
    _build_voidline_py(env)

    base_resolved: str | None = None
    if base_checkpoint:
        # Allow {balance_hash} substitution in the base path so curriculum
        # grids can pin to the BC checkpoint without hard-coding hashes.
        rendered = base_checkpoint.format(balance_hash=balance_hash)
        candidate = Path("/models") / rendered
        if candidate.is_file():
            shutil.copyfile(candidate, model_dir / "oracle.zip")
            base_resolved = str(candidate)
        else:
            (model_dir / "missing-base-checkpoint.txt").write_text(
                f"expected: {candidate}\n", encoding="utf-8"
            )

    provenance = {
        "variant_id": variant_id,
        "env_vars": env_vars,
        "train_args": train_args,
        "base_checkpoint_request": base_checkpoint,
        "base_checkpoint_resolved": base_resolved,
        "balance_hash": balance_hash,
        "eval_max_steps": eval_max_steps,
    }
    (model_dir / "provenance.json").write_text(
        json.dumps(provenance, indent=2) + "\n", encoding="utf-8"
    )

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
    metrics["base_checkpoint_resolved"] = base_resolved

    if proc.returncode != 0:
        metrics["error"] = "training subprocess failed (see train.log)"
        return metrics

    # Quick eval: scope sized so the eval can actually observe the
    # variant's target stage boss. Bumping max_steps means fewer episodes
    # in the same wallclock budget.
    eval_episodes = "8" if eval_max_steps >= 100000 else "12"
    eval_runs_per_ep = "3" if eval_max_steps >= 100000 else "5"
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
        eval_episodes,
        "--runs-per-episode",
        eval_runs_per_ep,
        "--max-steps",
        str(eval_max_steps),
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


@SWEEP_APP.function(
    image=image,
    volumes={"/models": models_volume},
    cpu=2,
    memory=4096,
    timeout=300,
)
def promote_best(grid: str, model_dir: str) -> str:
    """Copy the winning variant's ``oracle.zip`` to the curriculum path
    that the next stage reads from. Runs inside Modal so it can touch
    the persisted ``/models`` volume.
    """
    import shutil
    from pathlib import Path

    src = Path(model_dir) / "oracle.zip"
    if not src.is_file():
        return f"missing source: {src}"
    if grid == "curriculum_stage1":
        dst = Path("/models/curriculum/stage1/best.zip")
    elif grid == "curriculum_stage2":
        dst = Path("/models/curriculum/stage2/best.zip")
    elif grid == "curriculum_stage3":
        dst = Path("/models/curriculum/stage3/best.zip")
    elif grid == "easy_stage1":
        dst = Path("/models/curriculum/stage1_easy/best.zip")
    elif grid == "transfer_stage1":
        dst = Path("/models/curriculum/stage1_transfer/best.zip")
    else:
        return f"non-curriculum grid {grid}; nothing to promote"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dst)
    models_volume.commit()
    return str(dst)


def _resolve_balance_hash() -> str:
    import hashlib

    candidate = Path("data/balance.json")
    if candidate.exists():
        return hashlib.sha256(candidate.read_bytes()).hexdigest()[:16]
    return ""


@SWEEP_APP.local_entrypoint()
def main(grid: str = "reward", output: str = "reports/sweep.json") -> None:
    grid_fn = GRIDS.get(grid)
    if grid_fn is None:
        raise SystemExit(f"unknown grid: {grid}; available: {list(GRIDS)}")
    variants = grid_fn()
    balance_hash = _resolve_balance_hash()
    print(
        f"[sweep] launching {len(variants)} variants for grid={grid} "
        f"(balance_hash={balance_hash or 'unknown'})",
        flush=True,
    )

    starmap_args = [
        (
            v.id,
            v.env_vars,
            v.train_args,
            v.base_checkpoint,
            v.eval_max_steps,
            balance_hash,
        )
        for v in variants
    ]
    raw_results = list(train_variant.starmap(starmap_args))

    results = sorted(raw_results, key=score_variant, reverse=True)
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "grid": grid,
                "variants": len(variants),
                "balance_hash": balance_hash,
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
        if grid.startswith("curriculum_") or grid in {"easy_stage1", "transfer_stage1"}:
            best_model_dir = best.get("model_dir") or ""
            promotion = promote_best.remote(grid, best_model_dir)
            print(f"[sweep] promoted top-1 → {promotion}", flush=True)


if __name__ == "__main__":
    main()
