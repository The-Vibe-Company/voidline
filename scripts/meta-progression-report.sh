#!/usr/bin/env bash
# Wrapper for the Rust voidline-cli meta-progression report.
# Builds the binary in release mode (cached) then runs it from the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_DIR="$REPO_ROOT/sim"
TARGET_DIR="${CARGO_TARGET_DIR:-$SIM_DIR/target}"

cd "$SIM_DIR"
cargo build --release --bin voidline-cli >&2

cd "$REPO_ROOT"
exec "$TARGET_DIR/release/voidline-cli" "$@"
