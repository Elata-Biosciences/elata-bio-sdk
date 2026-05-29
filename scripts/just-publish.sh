#!/usr/bin/env bash
# End-to-end npm publish for a workspace package:
#   build -> verify -> ensure version isn't already on the registry
#   -> npm publish (auth via NPM_TOKEN, no global .npmrc pollution)
#   -> create and push git tag.
#
# Used by `just publish [pkg]`. Operates on a single package directory under
# packages/<pkg>. Reads NPM_TOKEN from .env if not already exported.
set -Eeuo pipefail

PKG="${1:-app-payments}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$ROOT_DIR/packages/$PKG"

die() {
    printf '\033[31mError:\033[0m %s\n' "$1" >&2
    [[ $# -gt 1 ]] && printf '\033[36mHint:\033[0m %s\n' "$2" >&2
    exit 1
}

note() { printf '\033[36m==>\033[0m %s\n' "$1"; }

[[ -d "$PKG_DIR" ]] || die "no such package: packages/$PKG" "valid packages: $(ls "$ROOT_DIR/packages" | tr '\n' ' ')"
[[ -f "$PKG_DIR/package.json" ]] || die "packages/$PKG has no package.json"

PKG_NAME="$(node -p "require('$PKG_DIR/package.json').name")"
PKG_VERSION="$(node -p "require('$PKG_DIR/package.json').version")"
IS_PRIVATE="$(node -p "Boolean(require('$PKG_DIR/package.json').private)")"

[[ "$IS_PRIVATE" == "false" ]] || die "$PKG_NAME is marked private in package.json"

# --- Auth: NPM_TOKEN from env or .env, written to a temp npmrc -----------------
if [[ -z "${NPM_TOKEN:-}" && -f "$ROOT_DIR/.env" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line#"${line%%[![:space:]]*}"}"
        [[ -z "$line" || "$line" == \#* ]] && continue
        [[ "$line" == export\ * ]] && line="${line#export }"
        key="${line%%=*}"; val="${line#*=}"
        [[ "$key" == "NPM_TOKEN" || "$key" == "npm_token" ]] || continue
        val="${val%$'\r'}"
        if [[ "$val" == \"*\" ]]; then val="${val#\"}"; val="${val%\"}"
        elif [[ "$val" == \'*\' ]]; then val="${val#\'}"; val="${val%\'}"
        fi
        export NPM_TOKEN="$val"
        break
    done < "$ROOT_DIR/.env"
fi

if [[ -n "${NPM_TOKEN:-}" ]]; then
    USER_NPMRC="$(mktemp "${TMPDIR:-/tmp}/elata-npmrc.XXXXXX")"
    trap 'rm -f "$USER_NPMRC"' EXIT
    printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$USER_NPMRC"
    export NPM_CONFIG_USERCONFIG="$USER_NPMRC"
    note "using NPM_TOKEN for auth"
else
    WHOAMI="$(npm whoami 2>/dev/null || true)"
    if [[ -z "$WHOAMI" ]]; then
        note "not logged in to npm; running 'npm login'"
        npm login
        WHOAMI="$(npm whoami 2>/dev/null || true)"
        [[ -n "$WHOAMI" ]] || die "npm login did not produce a session"
    fi
    note "using npm login session: $WHOAMI"
fi

# --- Safety checks -------------------------------------------------------------
cd "$ROOT_DIR"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
    note "not on main (on '$CURRENT_BRANCH'); continuing anyway in 2s — Ctrl-C to abort"
    sleep 2
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
    die "working tree has uncommitted changes" "commit or stash before publishing"
fi

REMOTE_VERSION="$(pnpm view "$PKG_NAME@$PKG_VERSION" version 2>/dev/null || true)"
if [[ -n "$REMOTE_VERSION" ]]; then
    die "$PKG_NAME@$PKG_VERSION is already published to npm" "bump the version in $PKG_DIR/package.json (or run 'pnpm changeset version') and try again"
fi

# --- Build + verify ------------------------------------------------------------
note "building $PKG_NAME@$PKG_VERSION"
pnpm --filter "$PKG_NAME" install
pnpm --filter "$PKG_NAME" run clean
pnpm --filter "$PKG_NAME" run build

if node -e "process.exit(require('$PKG_DIR/package.json').scripts?.['verify:publish'] ? 0 : 1)"; then
    note "verifying publish artifacts"
    pnpm --filter "$PKG_NAME" run verify:publish
fi

# --- Publish -------------------------------------------------------------------
note "publishing $PKG_NAME@$PKG_VERSION to npm with tag 'latest'"
( cd "$PKG_DIR" && pnpm publish --access public --tag latest --no-git-checks )

# --- Tag + push ----------------------------------------------------------------
TAG="$PKG-v$PKG_VERSION"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    note "tag $TAG already exists locally; skipping git tag"
else
    note "creating git tag $TAG"
    git tag "$TAG"
fi

note "pushing tag $TAG to origin"
git push origin "$TAG"

note "done: https://www.npmjs.com/package/$PKG_NAME/v/$PKG_VERSION"
