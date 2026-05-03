#!/usr/bin/env bash
# Local Champion-only balance gate check.
#
# Runs the Rust voidline-cli with the deterministic Champion profile and the
# `balance` check target so the command exits non-zero if the 20 / 50 / 100
# stage gates from CLAUDE.md are violated. No Modal, no ONNX models, no
# network — meant to take under two minutes on a dev machine.
#
# Override sample size / budget with env vars:
#   VOIDLINE_BALANCE_CHECK_CAMPAIGNS (default 2)
#   VOIDLINE_BALANCE_CHECK_RUNS      (default 120)
#   VOIDLINE_BALANCE_CHECK_BUDGET    (default 300 seconds wall clock)
#   VOIDLINE_BALANCE_CHECK_OUTPUT    (default .context/balance-check.json)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CAMPAIGNS="${VOIDLINE_BALANCE_CHECK_CAMPAIGNS:-2}"
RUNS="${VOIDLINE_BALANCE_CHECK_RUNS:-120}"
BUDGET="${VOIDLINE_BALANCE_CHECK_BUDGET:-300}"
OUTPUT="${VOIDLINE_BALANCE_CHECK_OUTPUT:-.context/balance-check.json}"

mkdir -p "$(dirname "$OUTPUT")"

exec scripts/meta-progression-report.sh \
    --player-profile champion \
    --policy-set focused \
    --campaigns "$CAMPAIGNS" \
    --runs "$RUNS" \
    --max-pressure 60 \
    --trial-seconds 360 \
    --max-seconds "$BUDGET" \
    --check-target balance \
    --output "$OUTPUT"
