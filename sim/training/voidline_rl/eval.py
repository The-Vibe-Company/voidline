from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from .detect_anomalies import detect


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("scripts/balance-rl-report.json"))
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--campaigns", type=int)
    parser.add_argument("--runs", type=int)
    parser.add_argument("--max-pressure", type=int)
    parser.add_argument("--trial-seconds", type=float)
    parser.add_argument("--max-seconds", type=float)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    raw_report = args.output.with_suffix(".raw.json")
    campaigns = args.campaigns if args.campaigns is not None else (2 if args.quick else 6)
    runs = args.runs if args.runs is not None else (3 if args.quick else 16)
    max_pressure = args.max_pressure if args.max_pressure is not None else (12 if args.quick else 40)
    trial_seconds = args.trial_seconds if args.trial_seconds is not None else (90.0 if args.quick else 360.0)
    max_seconds = args.max_seconds if args.max_seconds is not None else (120.0 if args.quick else 240.0)
    cmd = [
        str(args.repo_root / "scripts" / "meta-progression-report.sh"),
        "--default",
        "--player-profile",
        "learned-all",
        "--model-dir",
        str(args.model_dir),
        "--policy-set",
        "focused",
        "--campaigns",
        str(campaigns),
        "--runs",
        str(runs),
        "--max-pressure",
        str(max_pressure),
        "--trial-seconds",
        str(trial_seconds),
        "--max-seconds",
        str(max_seconds),
        "--output",
        str(raw_report),
    ]
    subprocess.run(cmd, cwd=args.repo_root, check=True)
    report = json.loads(raw_report.read_text())
    flags = detect(report)
    payload = {
        "schemaVersion": 1,
        "modelDir": str(args.model_dir),
        "sourceReport": str(raw_report),
        "flags": flags,
        "flagCount": len(flags),
        "profiles": report.get("profiles", []),
        "config": report.get("config", {}),
    }
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    if args.check and flags:
        raise SystemExit(3)


if __name__ == "__main__":
    main()
