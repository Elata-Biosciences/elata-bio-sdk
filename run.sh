#!/usr/bin/env bash
set -Eeuo pipefail

# Thin wrapper around the shared task-runner library.
#
# All command logic now lives in scripts/run-lib.sh, which is also exposed as
# `just` recipes (see ./justfile). Sourcing the library runs its command
# dispatch against this wrapper's positional parameters, so the historical
# `./run.sh <command> [args...]` CLI keeps working without requiring `just`
# (CI and existing tooling are unaffected).
#
# Prefer `just <command>` for day-to-day use; both paths execute the same code.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/run-lib.sh
source "$ROOT_DIR/scripts/run-lib.sh"
