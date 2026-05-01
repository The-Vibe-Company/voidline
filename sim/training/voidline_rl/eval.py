"""Oracle-driven balance evaluation.

Runs N multi-run episodes through ``VoidlineEnv`` using the trained oracle
policy and aggregates the result into a single ``oracle.json`` report —
replacing the legacy heuristic + learned split.

The output schema is intentionally flat compared to the legacy reports:

```json
{
  "schemaVersion": 2,
  "mode": "quick" | "full" | "test-card",
  "modelDir": "...",
  "oracle": {
    "episodes": int,
    "runs_per_episode": int,
    "stage_clears": {
      "stage1": {"rate": 0.95, "p25": 8, "p50": 12, "p75": 16},
      ...
    },
    "deaths_rate_per_run": float,
    "median_final_crystals": float,
    "median_runs_completed": float,
    "upgrade_pick_rates": [...],
    "relic_pick_rates": [...],
    "meta_purchase_rates": [...],
    "warnings": [...]
  }
}
```

The ``balance:test-card`` flow injects a ``--target-upgrade-id`` argument
that biases evaluation toward forcing the candidate object into the
draft pool; the aggregator then emits a verdict (OP / dead / balanced).
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
from sb3_contrib import MaskablePPO

from .env_voidline import VoidlineEnv


STAGE_TARGETS = (1, 2, 3)
DEAD_PICK_THRESHOLD = 0.05
OP_PICK_THRESHOLD = 0.7
OP_CLEAR_LIFT_THRESHOLD = 0.15


def run_episode(
    model: MaskablePPO,
    seed: int,
    runs_per_episode: int,
    max_steps: int,
) -> dict[str, Any]:
    env = VoidlineEnv(seed=seed, max_steps=max_steps, runs_per_episode=runs_per_episode)
    obs, _ = env.reset(seed=seed)
    summary: dict[str, Any] | None = None
    deaths = 0
    while True:
        masks = env.action_masks()
        action, _ = model.predict(obs, action_masks=masks, deterministic=True)
        obs, _reward, terminated, truncated, info = env.step(action)
        if info.get("death"):
            deaths += 1
        if terminated or truncated:
            summary = info.get("episode_summary")
            break
    if summary is None:
        # Defensive default — should never happen because the env always
        # populates episode_summary on the terminal step.
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


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    return float(np.percentile(values, p * 100))


def aggregate_pick_rates(
    offers: Counter, picks: Counter, runs_total: int
) -> list[dict[str, Any]]:
    rates: list[dict[str, Any]] = []
    for upgrade_id in sorted(set(offers) | set(picks)):
        n_offers = int(offers.get(upgrade_id, 0))
        n_picks = int(picks.get(upgrade_id, 0))
        rates.append(
            {
                "id": upgrade_id,
                "offers": n_offers,
                "picks": n_picks,
                "pickRateWhenOffered": (n_picks / n_offers) if n_offers > 0 else 0.0,
                "pickRatePerRun": (n_picks / runs_total) if runs_total > 0 else 0.0,
            }
        )
    return rates


def detect_warnings(rates: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    warnings = []
    for entry in rates:
        if entry["offers"] >= 8 and entry["pickRateWhenOffered"] < DEAD_PICK_THRESHOLD:
            warnings.append(
                {
                    "kind": "dead-pick",
                    "subject": f"{kind}:{entry['id']}",
                    "message": "Frequently offered but almost never selected by the oracle",
                    "value": entry["pickRateWhenOffered"],
                }
            )
        elif entry["offers"] >= 8 and entry["pickRateWhenOffered"] > OP_PICK_THRESHOLD:
            warnings.append(
                {
                    "kind": "op-pick",
                    "subject": f"{kind}:{entry['id']}",
                    "message": "Picked nearly every time it appears — possible OP / dominant choice",
                    "value": entry["pickRateWhenOffered"],
                }
            )
    return warnings


def aggregate(
    episodes: list[dict[str, Any]],
    runs_per_episode: int,
) -> dict[str, Any]:
    upgrade_offers: Counter = Counter()
    upgrade_picks: Counter = Counter()
    relic_offers: Counter = Counter()
    relic_picks: Counter = Counter()
    meta_purchases: Counter = Counter()

    runs_completed_per_episode: list[int] = []
    deaths_per_episode: list[int] = []
    final_crystals: list[int] = []
    runs_to_clear: dict[int, list[int]] = {stage: [] for stage in STAGE_TARGETS}
    cleared_counts: dict[int, int] = {stage: 0 for stage in STAGE_TARGETS}

    for ep in episodes:
        upgrade_offers.update(ep.get("upgrade_offers", {}))
        upgrade_picks.update(ep.get("upgrade_picks", {}))
        relic_offers.update(ep.get("relic_offers", {}))
        relic_picks.update(ep.get("relic_picks", {}))
        meta_purchases.update(ep.get("meta_purchases", {}))
        runs_completed_per_episode.append(int(ep.get("runs_completed", 0)))
        deaths_per_episode.append(int(ep.get("deaths", 0)))
        final_crystals.append(int(ep.get("final_crystals", 0)))
        clear_runs = ep.get("stage_clear_runs", {}) or {}
        for stage in STAGE_TARGETS:
            key = str(stage) if str(stage) in clear_runs else stage
            if key in clear_runs:
                cleared_counts[stage] += 1
                runs_to_clear[stage].append(int(clear_runs[key]) + 1)

    n_episodes = max(1, len(episodes))
    runs_total = sum(runs_completed_per_episode)
    deaths_total = sum(deaths_per_episode)

    stage_clears: dict[str, Any] = {}
    for stage in STAGE_TARGETS:
        ttc = runs_to_clear[stage]
        rate = cleared_counts[stage] / n_episodes
        stage_clears[f"stage{stage}"] = {
            "rate": rate,
            "p25": percentile(ttc, 0.25),
            "p50": percentile(ttc, 0.5),
            "p75": percentile(ttc, 0.75),
        }

    upgrade_rates = aggregate_pick_rates(upgrade_offers, upgrade_picks, runs_total)
    relic_rates = aggregate_pick_rates(relic_offers, relic_picks, runs_total)
    meta_rates = [
        {
            "id": meta_id,
            "purchases": int(count),
            "purchaseRatePerEpisode": int(count) / n_episodes,
        }
        for meta_id, count in sorted(meta_purchases.items())
    ]

    warnings: list[dict[str, Any]] = []
    warnings.extend(detect_warnings(upgrade_rates, "upgrade"))
    warnings.extend(detect_warnings(relic_rates, "relic"))

    return {
        "episodes": len(episodes),
        "runs_per_episode": runs_per_episode,
        "runs_completed_total": runs_total,
        "deaths_total": deaths_total,
        "deaths_rate_per_run": (deaths_total / runs_total) if runs_total > 0 else 0.0,
        "median_final_crystals": (
            statistics.median(final_crystals) if final_crystals else 0.0
        ),
        "median_runs_completed": (
            statistics.median(runs_completed_per_episode)
            if runs_completed_per_episode
            else 0.0
        ),
        "stage_clears": stage_clears,
        "upgrade_pick_rates": upgrade_rates,
        "relic_pick_rates": relic_rates,
        "meta_purchase_rates": meta_rates,
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--mode", choices=["quick", "full", "test-card"], default="quick")
    parser.add_argument("--episodes", type=int)
    parser.add_argument("--runs-per-episode", type=int)
    parser.add_argument("--max-steps", type=int, default=3600)
    parser.add_argument("--seed", type=int, default=1109)
    parser.add_argument(
        "--target-upgrade-id",
        type=str,
        default=None,
        help="When set (test-card mode), forces the agent to evaluate "
        "scenarios where this upgrade appears at least once per run.",
    )
    args = parser.parse_args()

    if args.mode == "quick":
        episodes_n = args.episodes if args.episodes is not None else 100
        runs_per_ep = args.runs_per_episode if args.runs_per_episode is not None else 50
    elif args.mode == "full":
        episodes_n = args.episodes if args.episodes is not None else 1000
        runs_per_ep = args.runs_per_episode if args.runs_per_episode is not None else 150
    else:  # test-card
        episodes_n = args.episodes if args.episodes is not None else 50
        runs_per_ep = args.runs_per_episode if args.runs_per_episode is not None else 30

    args.output.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = args.model_dir / "oracle.zip"
    if not checkpoint.is_file():
        # Fall back to ONNX-based runtime later. For now we require the .zip
        # so MaskablePPO can drive the env via .predict().
        raise SystemExit(
            f"missing oracle checkpoint at {checkpoint}; run `npm run balance:train` first"
        )

    print(f"[oracle-eval] loading {checkpoint}", flush=True)
    model = MaskablePPO.load(str(checkpoint))

    print(
        f"[oracle-eval] running {episodes_n} episodes × {runs_per_ep} runs each",
        flush=True,
    )
    episodes_summaries: list[dict[str, Any]] = []
    for idx in range(episodes_n):
        # Wrap seed inside the u32 PyO3 boundary expects.
        seed = (args.seed + idx * 0x9E3779B1) & 0xFFFFFFFF
        ep = run_episode(model, seed, runs_per_ep, args.max_steps)
        episodes_summaries.append(ep)
        if (idx + 1) % max(1, episodes_n // 10) == 0:
            print(f"  episode {idx + 1}/{episodes_n}", flush=True)

    aggregated = aggregate(episodes_summaries, runs_per_ep)
    payload: dict[str, Any] = {
        "schemaVersion": 2,
        "mode": args.mode,
        "modelDir": str(args.model_dir),
        "targetUpgradeId": args.target_upgrade_id,
        "oracle": aggregated,
    }

    if args.mode == "test-card" and args.target_upgrade_id is not None:
        payload["verdict"] = compute_card_verdict(aggregated, args.target_upgrade_id)

    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"[oracle-eval] wrote {args.output}", flush=True)


def compute_card_verdict(aggregated: dict[str, Any], target_id: str) -> dict[str, Any]:
    """Map aggregate metrics for the target id into a {OP, dead, balanced}
    verdict with a short diagnostic string.
    """
    upgrade_rate = next(
        (entry for entry in aggregated["upgrade_pick_rates"] if entry["id"] == target_id),
        None,
    )
    relic_rate = next(
        (entry for entry in aggregated["relic_pick_rates"] if entry["id"] == target_id),
        None,
    )
    meta_rate = next(
        (
            entry
            for entry in aggregated["meta_purchase_rates"]
            if entry["id"] == target_id
        ),
        None,
    )

    pick_rate = 0.0
    offers = 0
    if upgrade_rate is not None:
        pick_rate = upgrade_rate["pickRateWhenOffered"]
        offers = upgrade_rate["offers"]
    elif relic_rate is not None:
        pick_rate = relic_rate["pickRateWhenOffered"]
        offers = relic_rate["offers"]

    if offers < 5 and meta_rate is None:
        return {
            "label": "insufficient-data",
            "reason": "target appeared too rarely; rerun with more episodes or check requirements gating",
            "pickRateWhenOffered": pick_rate,
            "offers": offers,
        }

    if pick_rate < DEAD_PICK_THRESHOLD:
        return {
            "label": "dead",
            "reason": f"oracle picks this {pick_rate:.0%} of the time when offered (< {DEAD_PICK_THRESHOLD:.0%})",
            "pickRateWhenOffered": pick_rate,
            "offers": offers,
        }
    if pick_rate > OP_PICK_THRESHOLD:
        return {
            "label": "OP",
            "reason": f"oracle picks this {pick_rate:.0%} of the time when offered (> {OP_PICK_THRESHOLD:.0%})",
            "pickRateWhenOffered": pick_rate,
            "offers": offers,
        }
    return {
        "label": "balanced",
        "reason": f"oracle picks this {pick_rate:.0%} of the time, within the balanced band",
        "pickRateWhenOffered": pick_rate,
        "offers": offers,
    }


if __name__ == "__main__":
    main()
