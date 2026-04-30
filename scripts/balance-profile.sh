#!/usr/bin/env bash
# Opinionated balance profile wrapper.
#
# Keep the CLI replayable and configurable, but expose one simple project
# workflow: run enough campaigns, pressure, and seconds to detect when skilled
# profiles make the game too easy.

set -euo pipefail

MODE="profile"
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
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

case "$MODE" in
  quick)
    CAMPAIGNS=3
    RUNS=12
    MAX_SECONDS=60
    ;;
  check)
    CAMPAIGNS=8
    RUNS=20
    MAX_SECONDS=120
    EXTRA_ARGS+=(--check-target balance)
    ;;
  *)
    CAMPAIGNS=12
    RUNS=24
    MAX_SECONDS=180
    ;;
esac

exec "$(dirname "$0")/meta-progression-report.sh" \
  --default \
  --player-profile skilled \
  --campaigns "$CAMPAIGNS" \
  --runs "$RUNS" \
  --max-pressure 80 \
  --trial-seconds 720 \
  --max-seconds "$MAX_SECONDS" \
  --output scripts/balance-profile-report.json \
  "${EXTRA_ARGS[@]}"
