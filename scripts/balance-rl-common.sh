#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TRAINING_DIR="$REPO_ROOT/sim/training"
MODEL_DIR="${VOIDLINE_RL_MODEL_DIR:-$REPO_ROOT/.context/rl-models}"

build_voidline_py() {
  cd "$REPO_ROOT"
  if [[ "${VOIDLINE_RL_SYSTEM_PYTHON:-0}" == "1" ]]; then
    local wheel_dir
    wheel_dir="$(mktemp -d)"
    maturin build \
      --manifest-path "$REPO_ROOT/sim/crates/voidline-py/Cargo.toml" \
      --no-default-features \
      --features extension-module \
      --release \
      --out "$wheel_dir"
    python -m pip install --force-reinstall "$wheel_dir"/voidline_py-*.whl
    rm -rf "$wheel_dir"
  else
    uv run --project "$TRAINING_DIR" maturin develop \
      --manifest-path "$REPO_ROOT/sim/crates/voidline-py/Cargo.toml" \
      --no-default-features \
      --features extension-module \
      --release
  fi
}

run_training_python() {
  cd "$REPO_ROOT"
  if [[ "${VOIDLINE_RL_SYSTEM_PYTHON:-0}" == "1" ]]; then
    PYTHONPATH="$TRAINING_DIR${PYTHONPATH:+:$PYTHONPATH}" python -m "$@"
  else
    uv run --project "$TRAINING_DIR" python -m "$@"
  fi
}

require_models() {
  local dir="$1"
  local missing=0
  for persona in learned-human learned-optimizer learned-explorer learned-novice; do
    if [[ ! -f "$dir/$persona.onnx" ]]; then
      echo "missing RL model: $dir/$persona.onnx" >&2
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 ]]; then
    echo "Run npm run balance:rl:train:baseline or set VOIDLINE_RL_MODEL_DIR to a populated model directory." >&2
    exit 2
  fi
}
