#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/balance-rl-common.sh"

SMOKE_MODEL_DIR="${VOIDLINE_RL_SMOKE_MODEL_DIR:-$REPO_ROOT/.context/rl-smoke-models}"
rm -rf "$SMOKE_MODEL_DIR"
mkdir -p "$SMOKE_MODEL_DIR"

"$REPO_ROOT/scripts/balance-rl-train-baseline.sh" \
  --model-dir "$SMOKE_MODEL_DIR" \
  --timesteps "${VOIDLINE_RL_SMOKE_TIMESTEPS:-16}"

"$REPO_ROOT/scripts/balance-rl-report.sh" \
  --quick \
  --model-dir "$SMOKE_MODEL_DIR" \
  --output "$REPO_ROOT/scripts/balance-rl-smoke-report.json" \
  --campaigns 1 \
  --runs 1 \
  --max-pressure 4 \
  --trial-seconds 10 \
  --max-seconds 60
