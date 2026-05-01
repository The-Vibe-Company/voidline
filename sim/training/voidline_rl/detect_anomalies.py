from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def detect(report: dict[str, Any]) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    for profile in report.get("profiles", []):
        persona = profile.get("playerProfile") or profile.get("player_profile")
        for policy in profile.get("policies", []):
            policy_name = policy.get("policy")
            for warning in policy.get("warnings", []):
                flags.append(
                    {
                        "kind": warning.get("kind"),
                        "persona": persona,
                        "policy": policy_name,
                        "subject": warning.get("subject"),
                        "message": warning.get("message"),
                        "value": warning.get("value"),
                    }
                )
            stage1 = (policy.get("runsToStage1Clear") or {}).get("p50")
            stage2 = (policy.get("runsToStage2Clear") or {}).get("p50")
            stage3 = (policy.get("runsToStage3Clear") or {}).get("p50")
            if stage1 and stage2 and stage2 / max(stage1, 1.0) > 3.0:
                flags.append(
                    {
                        "kind": "progression-ravine",
                        "persona": persona,
                        "policy": policy_name,
                        "subject": "stage1-to-stage2",
                        "value": stage2 / max(stage1, 1.0),
                    }
                )
            if stage2 and stage3 and stage3 / max(stage2, 1.0) > 3.0:
                flags.append(
                    {
                        "kind": "progression-ravine",
                        "persona": persona,
                        "policy": policy_name,
                        "subject": "stage2-to-stage3",
                        "value": stage3 / max(stage2, 1.0),
                    }
                )
            for row in policy.get("upgradePickRates", []) + policy.get("relicPickRates", []):
                if row.get("pickRateWhenOffered", 0.0) > 0.85 and row.get("offerRatePerRun", 0.0) > 0.1:
                    flags.append(
                        {
                            "kind": "dominant-pick",
                            "persona": persona,
                            "policy": policy_name,
                            "subject": row.get("id"),
                            "value": row.get("pickRateWhenOffered"),
                        }
                    )
    return flags


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--fail-on-anomaly", action="store_true")
    args = parser.parse_args()

    report = json.loads(args.report.read_text())
    flags = detect(report)
    payload = {"flags": flags, "flagCount": len(flags)}
    text = json.dumps(payload, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    else:
        print(text, end="")
    if args.fail_on_anomaly and flags:
        raise SystemExit(3)


if __name__ == "__main__":
    main()
