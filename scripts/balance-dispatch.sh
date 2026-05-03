#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRAINING_DIR="$REPO_ROOT/sim/training"
PERSONAS=(oracle)

usage() {
  cat >&2 <<'EOF'
usage: scripts/balance-dispatch.sh <quick|full|train|test-card|hardcoded|bc|sweep|pull> [args...]

Commands:
  quick      Modal balance trend check via oracle RL agent (CPU, ~10 min)
  full       Modal deep balance report via oracle RL agent (big CPU, ~3-4h)
  train      Modal H100 RL training, persists oracle .zip + .onnx
  test-card  Force a target upgrade into draft/shop and verdict it (CPU)
  hardcoded  Run the heuristic baseline agent (decision gate for BC pipeline)
  bc         Roll out hardcoded + Behavior Cloning → oracle.zip warm-start
  sweep      Fan out N H100 training jobs in parallel
  pull       Pull Modal models/reports into .context

Options:
  --dry-run            print resolved Modal command/resources without launching
  --target-upgrade-id  (test-card) ID of the upgrade/relic/meta to evaluate
  pull --reports       pull reports instead of models
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

COMMAND="$1"
shift

DRY_RUN=0
PULL_MODE="models"
BALANCE_HASH=""
MODEL_DIR="${VOIDLINE_RL_MODEL_DIR:-$REPO_ROOT/.context/rl-models}"
REPORT_DIR="${VOIDLINE_BALANCE_REPORT_DIR:-$REPO_ROOT/.context/balance-reports}"
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --reports)
      PULL_MODE="reports"
      EXTRA_ARGS+=("$1")
      shift
      ;;
    --models)
      PULL_MODE="models"
      EXTRA_ARGS+=("$1")
      shift
      ;;
    --balance-hash)
      BALANCE_HASH="$2"
      EXTRA_ARGS+=("$1" "$2")
      shift 2
      ;;
    --model-dir)
      MODEL_DIR="$2"
      EXTRA_ARGS+=("$1" "$2")
      shift 2
      ;;
    --report-dir)
      REPORT_DIR="$2"
      EXTRA_ARGS+=("$1" "$2")
      shift 2
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

case "$COMMAND" in
  quick|full|train|test-card|hardcoded|bc|sweep|pull)
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

require_modal() {
  if ! command -v uvx >/dev/null 2>&1; then
    echo "balance commands require uvx to launch Modal. Install uv first." >&2
    exit 2
  fi
  if ! has_modal_credentials; then
    echo "balance commands require Modal credentials. Set MODAL_TOKEN_ID/MODAL_TOKEN_SECRET or run modal token set." >&2
    exit 2
  fi
}

resolve_balance_hash() {
  if [[ -n "$BALANCE_HASH" ]]; then
    printf "%s" "$BALANCE_HASH"
    return
  fi
  python3 -c 'import hashlib, pathlib; p=pathlib.Path("data/balance.json"); print(hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else "missing-balance")'
}

require_modal

BALANCE_HASH="$(resolve_balance_hash)"
GIT_SHA="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-${BALANCE_HASH}"

case "$COMMAND" in
  quick)
    RESOURCE_CLASS="cpu-burst"
    TIMEOUT_SECONDS=1800
    ;;
  full)
    RESOURCE_CLASS="big-cpu-burst"
    TIMEOUT_SECONDS=14280
    ;;
  train)
    RESOURCE_CLASS="h100-burst"
    TIMEOUT_SECONDS=21480
    ;;
  test-card)
    RESOURCE_CLASS="cpu-burst"
    TIMEOUT_SECONDS=1200
    ;;
  hardcoded)
    RESOURCE_CLASS="cpu-burst"
    TIMEOUT_SECONDS=1800
    ;;
  bc)
    RESOURCE_CLASS="cpu-burst"
    TIMEOUT_SECONDS=3600
    ;;
  sweep)
    # Sweeps fan out N H100 H100 jobs in parallel via voidline_rl.sweep::main.
    RESOURCE_CLASS="h100-burst"
    TIMEOUT_SECONDS=$((60 * 60))
    ;;
  pull)
    RESOURCE_CLASS="local-pull"
    TIMEOUT_SECONDS=0
    ;;
esac

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "backend=modal"
  echo "command=$COMMAND"
  echo "resource_class=$RESOURCE_CLASS"
  echo "balance_hash=$BALANCE_HASH"
  echo "git_sha=$GIT_SHA"
  echo "run_id=$RUN_ID"
  if [[ "$COMMAND" == "pull" ]]; then
    echo "pull_mode=$PULL_MODE"
    echo "model_dir=$MODEL_DIR"
    echo "report_dir=$REPORT_DIR"
  else
    echo "modal_app=voidline-balance"
    echo "modal_entrypoint=voidline_rl.modal_app::main"
    echo "timeout_seconds=$TIMEOUT_SECONDS"
    echo "report_path=/reports/$BALANCE_HASH/$COMMAND/$RUN_ID/$COMMAND.json"
    echo "model_dir=/models/$BALANCE_HASH"
    if ((${#EXTRA_ARGS[@]})); then
      echo "extra_args=$(shell_join "${EXTRA_ARGS[@]}")"
    fi
  fi
  exit 0
fi

if [[ "$COMMAND" == "pull" ]]; then
  if [[ "$PULL_MODE" == "models" ]]; then
    TMP_DIR="$REPO_ROOT/.context/modal-pull/models-$BALANCE_HASH"
    rm -rf "$TMP_DIR"
    mkdir -p "$TMP_DIR" "$MODEL_DIR"
    uvx modal volume get voidline-rl-models "$BALANCE_HASH" "$TMP_DIR" --force
    MODEL_SOURCE="$TMP_DIR/$BALANCE_HASH"
    if [[ ! -d "$MODEL_SOURCE" ]]; then
      MODEL_SOURCE="$TMP_DIR"
    fi
    for persona in "${PERSONAS[@]}"; do
      if [[ ! -s "$MODEL_SOURCE/$persona.zip" && ! -s "$MODEL_SOURCE/$persona.onnx" ]]; then
        echo "Modal model pull is missing $persona.{zip,onnx} for balance hash $BALANCE_HASH" >&2
        exit 1
      fi
    done
    find "$MODEL_SOURCE" -maxdepth 1 \( -name '*.zip' -o -name '*.onnx' -o -name '*.json' \) -exec cp {} "$MODEL_DIR"/ \;
    echo "Pulled Modal RL models for $BALANCE_HASH into $MODEL_DIR"
  else
    mkdir -p "$REPORT_DIR"
    uvx modal volume get voidline-balance-reports "$BALANCE_HASH" "$REPORT_DIR" --force
    echo "Pulled Modal balance reports for $BALANCE_HASH into $REPORT_DIR"
  fi
  exit 0
fi

if ((${#EXTRA_ARGS[@]})); then
  JSON_ARGS="$(python3 -c 'import json, sys; print(json.dumps(sys.argv[1:]))' "${EXTRA_ARGS[@]}")"
else
  JSON_ARGS="[]"
fi

echo "[balance-dispatch] backend=modal command=$COMMAND resource=$RESOURCE_CLASS run_id=$RUN_ID" >&2
cd "$REPO_ROOT"
export PYTHONPATH="$TRAINING_DIR${PYTHONPATH:+:$PYTHONPATH}"

if [[ "$COMMAND" == "sweep" ]]; then
  # Sweep has its own Modal app + entrypoint — flags are forwarded raw.
  exec uvx modal run -m voidline_rl.sweep::main "${EXTRA_ARGS[@]}"
fi

exec uvx modal run -m voidline_rl.modal_app::main \
  --command "$COMMAND" \
  --extra-args-json "$JSON_ARGS" \
  --git-sha "$GIT_SHA" \
  --balance-hash "$BALANCE_HASH" \
  --run-id "$RUN_ID"
