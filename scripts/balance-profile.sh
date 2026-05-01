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
    CAMPAIGNS=8
    RUNS=32
    MAX_SECONDS=120
    ;;
  check)
    CAMPAIGNS=30
    RUNS=80
    MAX_SECONDS=240
    EXTRA_ARGS+=(--check-target balance --policy-set focused)
    ;;
  *)
    CAMPAIGNS=12
    RUNS=48
    MAX_SECONDS=180
    ;;
esac

CMD=(
  "$(dirname "$0")/meta-progression-report.sh"
  --default
  --player-profile skilled
  --campaigns "$CAMPAIGNS"
  --runs "$RUNS"
  --max-pressure 80
  --trial-seconds 720
  --max-seconds "$MAX_SECONDS"
  --output scripts/balance-profile-report.json
)

if ((${#EXTRA_ARGS[@]})); then
  CMD+=("${EXTRA_ARGS[@]}")
fi

exec "${CMD[@]}"
