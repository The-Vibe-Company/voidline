#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/balance-rl-common.sh"

MODE="default"
OUTPUT="$REPO_ROOT/scripts/balance-rl-report.json"
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --quick)
      MODE="quick"
      shift
      ;;
    --check)
      MODE="check"
      shift
      ;;
    --model-dir)
      MODEL_DIR="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

require_models "$MODEL_DIR"
build_voidline_py

ARGS=(--repo-root "$REPO_ROOT" --model-dir "$MODEL_DIR" --output "$OUTPUT")
case "$MODE" in
  quick)
    ARGS+=(--quick)
    ;;
  check)
    ARGS+=(--check)
    ;;
esac
if ((${#EXTRA_ARGS[@]})); then
  ARGS+=("${EXTRA_ARGS[@]}")
fi

run_training_python voidline_rl.eval "${ARGS[@]}"
