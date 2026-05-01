#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRAINING_DIR="$REPO_ROOT/sim/training"

usage() {
  cat >&2 <<'EOF'
usage: scripts/balance-dispatch.sh <command> [args...]

Commands:
  meta-report              meta progression report
  meta-report-quick        quick meta progression report
  profile                  skilled balance profile
  profile-quick            quick skilled balance profile
  profile-check            balance profile with anomaly thresholds
  sweep-quick              quick balance sweep
  sweep-check              balance sweep with anomaly thresholds
  phase2-quick             quick isolated stage 2 balance report
  phase3-quick             quick isolated stage 3 balance report
  rl-train-baseline        train RL baseline personas
  rl-report-quick          quick RL learned-policy report
  rl-report                RL learned-policy report
  rl-check                 RL learned-policy report with anomaly thresholds
  rl-smoke                 tiny RL train/export/eval smoke

Environment:
  VOIDLINE_BALANCE_BACKEND=local  force local execution
  VOIDLINE_BALANCE_BACKEND=modal  force Modal execution
  unset/auto                     use Modal when credentials exist, otherwise local
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

COMMAND="$1"
shift

DRY_RUN=0
EXTRA_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      EXTRA_ARGS+=("$arg")
      ;;
  esac
done

LOCAL_CMD=()
case "$COMMAND" in
  meta-report)
    LOCAL_CMD=("$REPO_ROOT/scripts/meta-progression-report.sh" --default)
    ;;
  meta-report-quick)
    LOCAL_CMD=("$REPO_ROOT/scripts/meta-progression-report.sh" --quick)
    ;;
  profile)
    LOCAL_CMD=("$REPO_ROOT/scripts/balance-profile.sh")
    ;;
  profile-quick)
    LOCAL_CMD=("$REPO_ROOT/scripts/balance-profile.sh" --quick)
    ;;
  profile-check)
    LOCAL_CMD=("$REPO_ROOT/scripts/balance-profile.sh" --check)
    ;;
  sweep-quick)
    LOCAL_CMD=(
      "$REPO_ROOT/scripts/meta-progression-report.sh"
      --default
      --player-profile expert-human
      --policy-set focused
      --campaigns 6
      --runs 80
      --max-pressure 80
      --trial-seconds 720
      --max-seconds 180
      --output scripts/balance-sweep-report.json
    )
    ;;
  sweep-check)
    LOCAL_CMD=(
      "$REPO_ROOT/scripts/meta-progression-report.sh"
      --default
      --player-profile skilled
      --policy-set focused
      --campaigns 12
      --runs 120
      --max-pressure 80
      --trial-seconds 720
      --max-seconds 360
      --check-target balance
      --output scripts/balance-sweep-report.json
    )
    ;;
  phase2-quick)
    LOCAL_CMD=(
      "$REPO_ROOT/scripts/meta-progression-report.sh"
      --default
      --phase stage2
      --player-profile expert-human
      --policy-set focused
      --campaigns 6
      --runs 80
      --max-pressure 80
      --trial-seconds 720
      --max-seconds 180
      --output scripts/balance-phase2-report.json
    )
    ;;
  phase3-quick)
    LOCAL_CMD=(
      "$REPO_ROOT/scripts/meta-progression-report.sh"
      --default
      --phase stage3
      --player-profile expert-human
      --policy-set focused
      --campaigns 6
      --runs 80
      --max-pressure 80
      --trial-seconds 720
      --max-seconds 180
      --output scripts/balance-phase3-report.json
    )
    ;;
  rl-train-baseline)
    LOCAL_CMD=("$REPO_ROOT/scripts/balance-rl-train-baseline.sh")
    ;;
  rl-report-quick)
    LOCAL_CMD=("$REPO_ROOT/scripts/balance-rl-report.sh" --quick)
    ;;
  rl-report)
    LOCAL_CMD=("$REPO_ROOT/scripts/balance-rl-report.sh")
    ;;
  rl-check)
    LOCAL_CMD=("$REPO_ROOT/scripts/balance-rl-report.sh" --check)
    ;;
  rl-smoke)
    LOCAL_CMD=("$REPO_ROOT/scripts/balance-rl-smoke.sh")
    ;;
  *)
    echo "unknown balance command: $COMMAND" >&2
    usage
    exit 2
    ;;
esac

shell_join() {
  local quoted=()
  local item
  for item in "$@"; do
    quoted+=("$(printf "%q" "$item")")
  done
  printf "%s" "${quoted[*]}"
}

has_modal_credentials() {
  if [[ -n "${MODAL_TOKEN_ID:-}" && -n "${MODAL_TOKEN_SECRET:-}" ]]; then
    return 0
  fi

  local config_path="${MODAL_CONFIG_PATH:-${HOME:-}/.modal.toml}"
  if [[ -n "$config_path" && -f "$config_path" ]]; then
    python3 - "$config_path" <<'PY'
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    sys.exit(1)

try:
    data = tomllib.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
except Exception:
    sys.exit(1)

def has_tokens(value):
    if not isinstance(value, dict):
        return False
    if value.get("token_id") and value.get("token_secret"):
        return True
    return any(has_tokens(child) for child in value.values())

sys.exit(0 if has_tokens(data) else 1)
PY
    return $?
  fi

  return 1
}

has_modal_runner() {
  command -v uvx >/dev/null 2>&1
}

BACKEND="${VOIDLINE_BALANCE_BACKEND:-auto}"
TARGET_BACKEND=""
case "$BACKEND" in
  local)
    TARGET_BACKEND="local"
    ;;
  modal)
    TARGET_BACKEND="modal"
    ;;
  auto|"")
    if has_modal_credentials && has_modal_runner; then
      TARGET_BACKEND="modal"
    else
      TARGET_BACKEND="local"
      if [[ "$DRY_RUN" -eq 0 ]]; then
        echo "[balance-dispatch] Modal credentials or uv runner not found; running locally. Set VOIDLINE_BALANCE_BACKEND=modal to require Modal." >&2
      fi
    fi
    ;;
  *)
    echo "unsupported VOIDLINE_BALANCE_BACKEND=$BACKEND; expected local, modal, or auto" >&2
    exit 2
    ;;
esac

if [[ "$TARGET_BACKEND" == "modal" ]]; then
  if ! has_modal_credentials; then
    echo "Modal backend requested but credentials were not found. Configure MODAL_TOKEN_ID/MODAL_TOKEN_SECRET or run modal token set." >&2
    exit 2
  fi
  if ! has_modal_runner; then
    echo "Modal backend requested but uv was not found; install uv or force VOIDLINE_BALANCE_BACKEND=local." >&2
    exit 2
  fi
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "backend=$TARGET_BACKEND"
  echo "command=$COMMAND"
  if ((${#EXTRA_ARGS[@]})); then
    echo "local_command=$(shell_join "${LOCAL_CMD[@]}" "${EXTRA_ARGS[@]}")"
  else
    echo "local_command=$(shell_join "${LOCAL_CMD[@]}")"
  fi
  if [[ "$TARGET_BACKEND" == "modal" ]]; then
    echo "modal_app=voidline-balance"
    echo "modal_entrypoint=voidline_rl.modal_app::main"
    echo "modal_command=$COMMAND"
  fi
  exit 0
fi

if [[ "$TARGET_BACKEND" == "local" ]]; then
  echo "[balance-dispatch] backend=local command=$COMMAND" >&2
  exec "${LOCAL_CMD[@]}" "${EXTRA_ARGS[@]}"
fi

if ((${#EXTRA_ARGS[@]})); then
  json_args="$(
    python3 -c 'import json, sys; print(json.dumps(sys.argv[1:]))' "${EXTRA_ARGS[@]}"
  )"
else
  json_args="[]"
fi
git_sha="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
balance_hash="$(
  python3 -c 'import hashlib, pathlib; p=pathlib.Path("data/balance.json"); print(hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else "missing-balance")' \
    2>/dev/null
)"
run_id="$(date -u +%Y%m%dT%H%M%SZ)-${balance_hash}"

echo "[balance-dispatch] backend=modal command=$COMMAND run_id=$run_id" >&2
cd "$REPO_ROOT"
export PYTHONPATH="$TRAINING_DIR${PYTHONPATH:+:$PYTHONPATH}"
exec uvx modal run -m voidline_rl.modal_app::main \
  --command "$COMMAND" \
  --extra-args-json "$json_args" \
  --git-sha "$git_sha" \
  --balance-hash "$balance_hash" \
  --run-id "$run_id"
