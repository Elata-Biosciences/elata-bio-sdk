#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible wrapper.
# Canonical implementation lives in packages/rppg-web/scripts/build-demo.mjs.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[rppg] Deprecated wrapper: delegating to packages/rppg-web/scripts/build-demo.mjs wasm"

node "$ROOT_DIR/packages/rppg-web/scripts/build-demo.mjs" wasm
