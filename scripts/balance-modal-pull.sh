#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="${VOIDLINE_RL_MODEL_DIR:-$REPO_ROOT/.context/rl-models}"
REPORT_DIR="${VOIDLINE_BALANCE_REPORT_DIR:-$REPO_ROOT/.context/balance-reports}"
BALANCE_HASH=""
PULL_MODE="models"
PERSONAS=(learned-human learned-optimizer learned-explorer learned-novice)

if ! command -v uvx >/dev/null 2>&1; then
  echo "balance:modal:pull requires uvx. Install uv or use Modal's CLI directly." >&2
  exit 2
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --balance-hash)
      BALANCE_HASH="$2"
      shift 2
      ;;
    --model-dir)
      MODEL_DIR="$2"
      shift 2
      ;;
    --report-dir)
      REPORT_DIR="$2"
      shift 2
      ;;
    --reports)
      PULL_MODE="reports"
      shift
      ;;
    --models)
      PULL_MODE="models"
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$BALANCE_HASH" ]]; then
  BALANCE_HASH="$(
    cd "$REPO_ROOT"
    python3 -c 'import hashlib, pathlib; p=pathlib.Path("data/balance.json"); print(hashlib.sha256(p.read_bytes()).hexdigest()[:16])'
  )"
fi

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
    if [[ ! -s "$MODEL_SOURCE/$persona.onnx" ]]; then
      echo "Modal model pull is missing $persona.onnx for balance hash $BALANCE_HASH" >&2
      exit 1
    fi
  done
  find "$MODEL_SOURCE" -maxdepth 1 \( -name '*.onnx' -o -name '*.json' \) -exec cp {} "$MODEL_DIR"/ \;
  echo "Pulled Modal RL models for $BALANCE_HASH into $MODEL_DIR"
else
  mkdir -p "$REPORT_DIR"
  uvx modal volume get voidline-balance-reports "$BALANCE_HASH" "$REPORT_DIR" --force
  echo "Pulled Modal balance reports for $BALANCE_HASH into $REPORT_DIR"
fi
