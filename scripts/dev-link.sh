#!/usr/bin/env bash
# Kept for backwards compatibility — delegate to run.sh sync-to which now
# performs build + install into the target app.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-$ROOT_DIR/../my-app}"
SAVE="${SAVE:-0}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "App directory not found: $APP_DIR" >&2
  echo "Set APP_DIR to the target app path." >&2
  exit 1
fi

if [[ "$SAVE" == "1" ]]; then
  export SAVE=1
fi

# Delegate to run.sh for the heavy lifting
"$ROOT_DIR/run.sh" sync-to "$APP_DIR" release

echo "Done (via run.sh sync-to)."
