#!/usr/bin/env bash
# Wrapper for the Rust voidline-cli meta-progression report.
# Builds the binary in release mode (cached) then runs it from the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_DIR="$REPO_ROOT/sim"
TARGET_DIR="${CARGO_TARGET_DIR:-$SIM_DIR/target}"

cd "$SIM_DIR"
# Cargo cache invalidation marker. Bump REBUILD_MARKER_VALUE whenever the
# Rust source changes in a way that requires a clean rebuild on Modal
# (where the cargo target dir lives on a persistent volume that has
# repeatedly retained stale binaries past mtime-based fingerprinting).
REBUILD_MARKER_VALUE="20260501b-gunner-enemy"
REBUILD_MARKER_FILE="$TARGET_DIR/.voidline-rebuild-marker"
mkdir -p "$TARGET_DIR"
if [[ ! -f "$REBUILD_MARKER_FILE" ]] || [[ "$(cat "$REBUILD_MARKER_FILE" 2>/dev/null)" != "$REBUILD_MARKER_VALUE" ]]; then
  echo "[meta-progression-report] nuking cargo target release (marker $REBUILD_MARKER_VALUE)" >&2
  if ! rm -rf "$TARGET_DIR/release" "$TARGET_DIR/debug"; then
    echo "[meta-progression-report] cleanup failed; leaving marker unchanged so the next run retries" >&2
    exit 1
  fi
  echo "$REBUILD_MARKER_VALUE" > "$REBUILD_MARKER_FILE"
fi
cargo build --release --bin voidline-cli >&2

cd "$REPO_ROOT"
exec "$TARGET_DIR/release/voidline-cli" "$@"
