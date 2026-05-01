#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/balance-rl-common.sh"

TIMESTEPS="${VOIDLINE_RL_TIMESTEPS:-2048}"
PERSONA="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --model-dir)
      MODEL_DIR="$2"
      shift 2
      ;;
    --timesteps)
      TIMESTEPS="$2"
      shift 2
      ;;
    --persona)
      PERSONA="$2"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$MODEL_DIR"
build_voidline_py
run_training_python voidline_rl.train \
  --persona "$PERSONA" \
  --model-dir "$MODEL_DIR" \
  --timesteps "$TIMESTEPS"
