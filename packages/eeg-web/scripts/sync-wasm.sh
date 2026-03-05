#!/usr/bin/env bash
set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
SRC_DIR="${EEG_WASM_SRC_DIR:-$REPO_ROOT/eeg-demo/pkg}"
DEST_DIR="$PKG_DIR/wasm"

required=(
  "eeg_wasm.js"
  "eeg_wasm.d.ts"
  "eeg_wasm_bg.wasm"
  "eeg_wasm_bg.wasm.d.ts"
)

for f in "${required[@]}"; do
  if [[ ! -f "$SRC_DIR/$f" ]]; then
    echo "Missing $f in $SRC_DIR. Run ./run.sh build first." >&2
    exit 1
  fi
done

mkdir -p "$DEST_DIR"
for f in "${required[@]}"; do
  cp -f "$SRC_DIR/$f" "$DEST_DIR/$f"
done

echo "WASM files copied to $DEST_DIR"
