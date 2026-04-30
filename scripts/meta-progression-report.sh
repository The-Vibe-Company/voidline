#!/usr/bin/env bash
# Wrapper for the Rust voidline-cli meta-progression report.
# Builds the binary in release mode (cached) then runs it from the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_DIR="$REPO_ROOT/sim"

cd "$SIM_DIR"
cargo build --release --bin voidline-cli >&2

cd "$REPO_ROOT"
exec "$SIM_DIR/target/release/voidline-cli" "$@"
