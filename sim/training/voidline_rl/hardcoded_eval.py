"""Run the hardcoded heuristic agent for N episodes and emit an
oracle-compatible report.

Decision gate: read ``oracle.stage_clears.stage1.rate`` from the output
to decide whether the env is solvable by a simple strategy. Used as the
seed signal for the BC + curriculum pipeline.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import numpy as np

from .env_voidline import VoidlineEnv
from .eval import (
    DEFAULT_MAX_STEPS,
    aggregate,
)
from .hardcoded import HardcodedAgent


def run_episode(
    seed: int,
    runs_per_episode: int,
    max_steps: int,
) -> dict[str, Any]:
    env = VoidlineEnv(seed=seed, max_steps=max_steps, runs_per_episode=runs_per_episode)
    obs, _ = env.reset(seed=seed)
    agent = HardcodedAgent(seed=seed)
    summary: dict[str, Any] | None = None
    deaths = 0
    while True:
        # Pull both flat (for symmetry with PPO eval) and structured masks.
        flat_mask = env.action_masks()
        # The dict version is exposed via the underlying _env directly.
        masks_dict = env._env.action_masks()  # noqa: SLF001 — eval helper, intentional
        masks_dict = {
            "movement": np.asarray(masks_dict["movement"], dtype=bool),
            "upgrade_pick": np.asarray(masks_dict["upgrade_pick"], dtype=bool),
            "relic_pick": np.asarray(masks_dict["relic_pick"], dtype=bool),
            "shop_pick": np.asarray(masks_dict["shop_pick"], dtype=bool),
        }
        # With SMDP movement handled internally by the Rust env, we only
        # need the upgrade/relic scoring here. Use the cheaper greedy
        # `expert_action()` — same per-upgrade scoring as the legacy
        # main heuristic, no lookahead overhead. action[0] is ignored
        # by env step_run when VOIDLINE_RUST_MOVEMENT=1.
        action = np.asarray(env._env.expert_action(), dtype=np.int64)  # noqa: SLF001
        if action[3] == 0 and masks_dict["shop_pick"][1:].any():
            shop_action = agent._select_shop(obs, masks_dict)  # noqa: SLF001
            if shop_action != 0:
                action[3] = shop_action
        del flat_mask
        obs, _reward, terminated, truncated, info = env.step(action)
        if info.get("death"):
            deaths += 1
        if terminated or truncated:
            summary = info.get("episode_summary")
            break
    if summary is None:
        summary = {
            "runs_completed": 0,
            "final_crystals": 0,
            "highest_stage_cleared": 0,
            "stage_clear_runs": {},
            "upgrade_offers": {},
            "upgrade_picks": {},
            "relic_offers": {},
            "relic_picks": {},
            "meta_purchases": {},
        }
    summary["deaths"] = deaths
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=None)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--episodes", type=int, default=30)
    parser.add_argument("--runs-per-episode", type=int, default=6)
    parser.add_argument("--max-steps", type=int, default=DEFAULT_MAX_STEPS["quick"])
    parser.add_argument("--seed", type=int, default=1109)
    parser.add_argument(
        "--decision-gate",
        type=float,
        default=0.30,
        help="Stage 1 clear rate threshold for the GO/NO-GO verdict.",
    )
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    print(
        f"[hardcoded-eval] running {args.episodes} episodes × "
        f"{args.runs_per_episode} runs (max_steps={args.max_steps})",
        flush=True,
    )

    episodes_summaries: list[dict[str, Any]] = []
    for idx in range(args.episodes):
        seed = (args.seed + idx * 0x9E3779B1) & 0xFFFFFFFF
        ep = run_episode(seed, args.runs_per_episode, args.max_steps)
        episodes_summaries.append(ep)
        if (idx + 1) % max(1, args.episodes // 10) == 0:
            stage1 = ep.get("stage_clear_runs", {}).get(1) or ep.get(
                "stage_clear_runs", {}
            ).get("1")
            print(
                f"  episode {idx + 1}/{args.episodes} "
                f"(stage1_run={stage1}, runs={ep.get('runs_completed')})",
                flush=True,
            )

    aggregated = aggregate(episodes_summaries, args.runs_per_episode)
    stage1_rate = aggregated["stage_clears"]["stage1"]["rate"]
    verdict = "GO" if stage1_rate >= args.decision_gate else "NO-GO"

    payload: dict[str, Any] = {
        "schemaVersion": 2,
        "mode": "hardcoded",
        "agent": "HardcodedAgent",
        "decisionGate": args.decision_gate,
        "verdict": verdict,
        "oracle": aggregated,
    }
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(
        f"[hardcoded-eval] verdict={verdict} stage1.rate={stage1_rate:.2%} "
        f"→ {args.output}",
        flush=True,
    )


if __name__ == "__main__":
    main()
