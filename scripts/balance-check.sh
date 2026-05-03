#!/usr/bin/env bash
# Local Champion-only balance gate check.
#
# Validates the 20 / 50 / 100 stage gates from CLAUDE.md by running the
# Rust voidline-cli three times: once per stage. Each phase reuses the
# previous phase's checkpoint so we don't re-simulate the early game on
# every invocation. Checkpoints are keyed on the data/balance.json hash
# inside ``.context/balance-checkpoints/``, so editing balance auto-
# invalidates the cache, and a clean re-run regenerates everything.
#
# First invocation after a balance change: 5–10 minutes (full chain).
# Subsequent invocations on the same balance.json: under two minutes.
#
# Override sample size / budget with env vars:
#   VOIDLINE_BALANCE_CHECK_CAMPAIGNS  (default 2)
#   VOIDLINE_BALANCE_CHECK_RUNS       (per-phase, default 30)
#   VOIDLINE_BALANCE_CHECK_BUDGET     (per-phase wall clock, default 600s)
#   VOIDLINE_BALANCE_CHECK_TRIAL      (single-trial sim seconds, default 1800)
#   VOIDLINE_BALANCE_CHECK_MAX_PRESSURE (default 60)
#   VOIDLINE_BALANCE_CHECK_OUTPUT_DIR (default .context/balance-check)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CAMPAIGNS="${VOIDLINE_BALANCE_CHECK_CAMPAIGNS:-2}"
RUNS="${VOIDLINE_BALANCE_CHECK_RUNS:-60}"
BUDGET="${VOIDLINE_BALANCE_CHECK_BUDGET:-600}"
# A trial covers one Champion run from selected start stage to death or
# until budget. 1800s = 30 min, plenty for stage1+boss+stage2+boss+stage3+boss
# even when the boss fight stretches.
TRIAL_SECONDS="${VOIDLINE_BALANCE_CHECK_TRIAL:-1800}"
MAX_PRESSURE="${VOIDLINE_BALANCE_CHECK_MAX_PRESSURE:-60}"
OUTPUT_DIR="${VOIDLINE_BALANCE_CHECK_OUTPUT_DIR:-.context/balance-check}"

mkdir -p "$OUTPUT_DIR"

FAIL=0

run_phase() {
    local phase=$1
    local out="$OUTPUT_DIR/${phase}.json"
    echo "[balance:check] phase=$phase  runs=$RUNS  campaigns=$CAMPAIGNS" >&2
    if ! scripts/meta-progression-report.sh \
        --player-profile champion \
        --policy-set focused \
        --phase "$phase" \
        --campaigns "$CAMPAIGNS" \
        --runs "$RUNS" \
        --max-pressure "$MAX_PRESSURE" \
        --trial-seconds "$TRIAL_SECONDS" \
        --max-seconds "$BUDGET" \
        --check-target balance \
        --output "$out"; then
        FAIL=1
        echo "[balance:check] phase=$phase failed — continuing so later phases still run" >&2
    fi
}

# Phase 1 generates stage-1 checkpoints + validates the stage 1 gate.
# Phase stage2/stage3 reuse cached checkpoints (auto-generated on miss,
# keyed on the data/balance.json hash inside .context/balance-checkpoints).
# We deliberately run all three even if an earlier phase failed: each phase
# is informative and the checkpoints generated during a failing run are
# still valid for the next phase.
run_phase full
run_phase stage2
run_phase stage3

if [ "$FAIL" -ne 0 ]; then
    echo "[balance:check] one or more gates violated — see $OUTPUT_DIR/*.json" >&2
    exit 3
fi

echo "[balance:check] all gates ok — reports in $OUTPUT_DIR/" >&2
