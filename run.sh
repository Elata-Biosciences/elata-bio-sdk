#!/usr/bin/env bash
set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Error helpers (dependency-free; usable from any command path).
# -----------------------------------------------------------------------------

RUN_SH_TASK="${RUN_SH_TASK:-}"

_runsh_color() {
    local code="$1"
    if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
        printf '\033[%sm' "$code"
    fi
}

_runsh_reset() {
    if [[ -t 2 && -z "${NO_COLOR:-}" ]]; then
        printf '\033[0m'
    fi
}

die() {
    local msg="$1"
    shift || true
    printf "%sError:%s %s\n" "$(_runsh_color 31)" "$(_runsh_reset)" "$msg" >&2
    if [[ $# -gt 0 ]]; then
        printf "%sHint:%s %s\n" "$(_runsh_color 36)" "$(_runsh_reset)" "$*" >&2
    fi
    exit 1
}

on_err() {
    # If errexit is disabled (e.g. doctor uses set +e), avoid noisy errors.
    case "$-" in
        *e*) ;;
        *) return 0 ;;
    esac

    local rc="$1"
    local line="$2"
    local cmd="$3"

    # Avoid recursive trap loops.
    trap - ERR

    local task_note=""
    if [[ -n "${RUN_SH_TASK:-}" ]]; then
        task_note=" (task: ${RUN_SH_TASK})"
    fi

    printf "%sCommand failed%s%s (exit %s)\n" "$(_runsh_color 31)" "$(_runsh_reset)" "$task_note" "$rc" >&2
    printf "  at %s:%s\n" "${BASH_SOURCE[1]:-$0}" "$line" >&2
    printf "  while running: %s\n" "$cmd" >&2
    printf "%sHint:%s re-run with \`bash -x %s ...\` for a trace, or run \`./run.sh doctor\` to validate toolchain.\n" "$(_runsh_color 36)" "$(_runsh_reset)" "$0" >&2
    exit "$rc"
}

trap 'on_err "$?" "$LINENO" "$BASH_COMMAND"' ERR

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="wasm32-unknown-unknown"

# Load NPM_TOKEN from repo-root .env when not already set (supports NPM_TOKEN= or npm_token=).
# Does not override an existing environment variable. Skips comments and blank lines.
ensure_npm_token_from_dotenv() {
    if [[ -n "${NPM_TOKEN:-}" ]]; then
        return 0
    fi
    local env_file="$ROOT_DIR/.env"
    if [[ ! -f "$env_file" ]]; then
        return 0
    fi
    local line key val
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [[ -z "$line" || "$line" == \#* ]] && continue
        if [[ "$line" == export\ * ]]; then
            line="${line#export }"
        fi
        [[ "$line" == *"="* ]] || continue
        key="${line%%=*}"
        val="${line#*=}"
        if [[ "$key" != "NPM_TOKEN" && "$key" != "npm_token" ]]; then
            continue
        fi
        val="${val%$'\r'}"
        if [[ "$val" == \"*\" ]]; then
            val="${val#\"}"
            val="${val%\"}"
        elif [[ "$val" == \'*\' ]]; then
            val="${val#\'}"
            val="${val%\'}"
        fi
        export NPM_TOKEN="$val"
        return 0
    done <"$env_file"
}

ensure_crates_token_from_dotenv() {
    if [[ -n "${CRATES_TOKEN:-}" || -n "${CARGO_REGISTRY_TOKEN:-}" ]]; then
        return 0
    fi
    local env_file="$ROOT_DIR/.env"
    if [[ ! -f "$env_file" ]]; then
        return 0
    fi
    local line key val
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [[ -z "$line" || "$line" == \#* ]] && continue
        if [[ "$line" == export\ * ]]; then
            line="${line#export }"
        fi
        [[ "$line" == *"="* ]] || continue
        key="${line%%=*}"
        val="${line#*=}"
        if [[ "$key" != "CRATES_TOKEN" && "$key" != "crates_token" ]]; then
            continue
        fi
        val="${val%$'\r'}"
        if [[ "$val" == \"*\" ]]; then
            val="${val#\"}"
            val="${val%\"}"
        elif [[ "$val" == \'*\' ]]; then
            val="${val#\'}"
            val="${val%\'}"
        fi
        export CRATES_TOKEN="$val"
        return 0
    done <"$env_file"
}

# Apply registry auth only when NPM_TOKEN is set. Avoids ${NPM_TOKEN} in repo .npmrc,
# which makes pnpm warn on every command when the variable is unset.
with_npm_registry_auth() {
    local user_npmrc=""
    if [[ -n "${NPM_TOKEN:-}" ]]; then
        user_npmrc="$(mktemp "${TMPDIR:-/tmp}/elata-npmrc.XXXXXX")" || die "mktemp failed for npm auth config"
        printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" >"$user_npmrc"
        export NPM_CONFIG_USERCONFIG="$user_npmrc"
    fi
    local rc=0
    "$@" || rc=$?
    if [[ -n "${user_npmrc:-}" ]]; then
        unset NPM_CONFIG_USERCONFIG
        rm -f "$user_npmrc"
    fi
    return "$rc"
}

# Fail fast with a clear message if the npm registry token cannot authenticate.
# An invalid/expired/revoked token otherwise surfaces as a misleading 404 when
# publishing: an unauthenticated PUT to a scoped package is reported as
# "not found" rather than "unauthorized", to avoid leaking the scope's existence.
verify_npm_token_or_die() {
    local who rc=0
    who="$(with_npm_registry_auth npm whoami --registry=https://registry.npmjs.org/ 2>/dev/null)" || rc=$?
    if [[ "$rc" -ne 0 || -z "$who" ]]; then
        if [[ -n "${NPM_TOKEN:-}" ]]; then
            die "npm authentication failed: NPM_TOKEN is invalid, expired, or revoked." \
                "Generate a new Automation or Granular Access token (your account has 2FA on writes, so a classic publish token will not work non-interactively) at https://www.npmjs.com/settings/<your-user>/tokens/new and update NPM_TOKEN in ${ROOT_DIR}/.env."
        else
            die "npm authentication failed and no NPM_TOKEN is set." \
                "Set NPM_TOKEN in ${ROOT_DIR}/.env or run 'npm login' so publishing can authenticate."
        fi
    fi
    echo "Authenticated to npm registry as '${who}'."
}

with_cargo_registry_auth() {
    local previous_token="${CARGO_REGISTRY_TOKEN:-}"
    local had_previous=0
    if [[ -n "${CARGO_REGISTRY_TOKEN:-}" ]]; then
        had_previous=1
    fi

    if [[ -z "${CARGO_REGISTRY_TOKEN:-}" && -n "${CRATES_TOKEN:-}" ]]; then
        export CARGO_REGISTRY_TOKEN="$CRATES_TOKEN"
    fi

    local rc=0
    "$@" || rc=$?

    if [[ "$had_previous" -eq 0 ]]; then
        unset CARGO_REGISTRY_TOKEN
    else
        export CARGO_REGISTRY_TOKEN="$previous_token"
    fi

    return "$rc"
}
EEG_PACKAGE="elata-eeg-wasm"
EEG_BINDINGS_OUT_DIR="$ROOT_DIR/eeg-demo/pkg"
TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT_DIR/target}"
DEFAULT_JOBS=""
PKG_MGR=""

usage() {
    local c_reset="" c_bold="" c_dim="" c_cyan="" c_green=""
    if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
        c_reset=$'\033[0m'
        c_bold=$'\033[1m'
        c_dim=$'\033[2m'
        c_cyan=$'\033[36m'
        c_green=$'\033[32m'
    fi

    section() { printf "\n${c_bold}${c_cyan}%s${c_reset}\n" "$1"; }
    cmd() { printf "  ${c_green}%-18s${c_reset} %s\n" "$1" "$2"; }

    printf "${c_bold}Usage:${c_reset} %s [command] [target]\n" "$0"
    printf "${c_dim}(no args runs 'help')${c_reset}\n"

    section "Build & Demo"
    cmd "install" "Install/update workspace dependencies"
    cmd "dev" "Build debug artifacts for 'eeg', 'rppg', or 'all' (default: all)"
    cmd "build" "Build release artifacts for 'eeg', 'rppg', or 'all' (default: all)"
    cmd "bindings" "Generate bindings from an existing build (default: release)"
    cmd "docs" "Run internal Mintlify docs tooling (default: 'mint dev --no-open')"
    cmd "demo" "Run in-repo demo: 'rppg' (default), 'ppg', 'hal', or 'eeg' (example: './run.sh demo ppg')"
    cmd "create" "Scaffold app via create-elata-demo (examples: './run.sh create ppg my-app', './run.sh create my-app')"
    cmd "sync-to" "Build eeg-web and install it into a local app (default app: ../my-app)"

    section "Quality"
    cmd "doctor" "Run fast health checks (toolchain, repo audit, deps, artifact presence)"
    cmd "verify-all" "Run publish-grade verification for release artifacts and tarballs"
    cmd "test" "Run Rust and web test suites"
    cmd "format" "Format files with Biome"
    cmd "format-check" "Run Biome format check (no write)"

    section "Release"
    cmd "changeset" "Add a changeset (interactive; run before opening a PR)"
    cmd "bump" "Apply changesets: bump versions and update CHANGELOGs"
    cmd "release-check" "Run full release preflight without publishing (default target: all)"
    cmd "release" "Build, publish, tag, and push (default: all + npm tag latest; use release major|minor|patch to semver-bump all packages first)"
    cmd "publish" "Publish package(s) to npm in repo release order (default: all + npm tag latest)"
    cmd "promote" "Promote selected package version(s) to npm 'latest' dist-tag"
    cmd "view" "Show latest published npm version(s) for selected package(s)"
    cmd "tag-release" "Create package-scoped git tag(s) from package.json versions"
    cmd "push-tags" "Push package-scoped git tag(s) for current package.json versions"
    cmd "rust-release-check" "Verify Rust crates are ready to publish to crates.io (default target: all)"
    cmd "rust-publish" "Run Rust release flow: check, publish, commit, tag, and push (default target: all)"

    section "Maintenance"
    cmd "clean" "Remove generated bindings and clean build artifacts"
    cmd "help" "Show this message"
}

normalize_release_target() {
    local raw="${1:-all}"
    case "$raw" in
        all) echo "all" ;;
        eeg|eeg-web|@elata-biosciences/eeg-web) echo "eeg-web" ;;
        eeg-web-ble|ble|@elata-biosciences/eeg-web-ble) echo "eeg-web-ble" ;;
        rppg|rppg-web|@elata-biosciences/rppg-web) echo "rppg-web" ;;
        ppg|ppg-web|@elata-biosciences/ppg-web) echo "ppg-web" ;;
        create-elata-demo|@elata-biosciences/create-elata-demo) echo "create-elata-demo" ;;
        *)
            echo "Unknown release target: $raw" >&2
            return 1
            ;;
    esac
}

package_dir_for_target() {
    case "$1" in
        eeg-web) echo "packages/eeg-web" ;;
        eeg-web-ble) echo "packages/eeg-web-ble" ;;
        rppg-web) echo "packages/rppg-web" ;;
        ppg-web) echo "packages/ppg-web" ;;
        create-elata-demo) echo "packages/create-elata-demo" ;;
        *)
            echo "Unknown package target: $1" >&2
            return 1
            ;;
    esac
}

package_name_for_target() {
    case "$1" in
        eeg-web) echo "@elata-biosciences/eeg-web" ;;
        eeg-web-ble) echo "@elata-biosciences/eeg-web-ble" ;;
        rppg-web) echo "@elata-biosciences/rppg-web" ;;
        ppg-web) echo "@elata-biosciences/ppg-web" ;;
        create-elata-demo) echo "@elata-biosciences/create-elata-demo" ;;
        *)
            echo "Unknown package target: $1" >&2
            return 1
            ;;
    esac
}

release_tag_prefix_for_target() {
    case "$1" in
        eeg-web) echo "eeg-web" ;;
        eeg-web-ble) echo "eeg-web-ble" ;;
        rppg-web) echo "rppg-web" ;;
        ppg-web) echo "ppg-web" ;;
        create-elata-demo) echo "create-elata-demo" ;;
        *)
            echo "Unknown package target: $1" >&2
            return 1
            ;;
    esac
}

release_targets_for() {
    local target="$1"
    if [[ "$target" == "all" ]]; then
        # Keep repo-published dependency order.
        echo "eeg-web eeg-web-ble rppg-web ppg-web create-elata-demo"
    else
        echo "$target"
    fi
}

normalize_rust_release_target() {
    local raw="${1:-all}"
    case "$raw" in
        all) echo "all" ;;
        elata-muse-proto|elata-eeg-hal|elata-eeg-signal|elata-eeg-models|elata-rppg)
            echo "$raw"
            ;;
        *)
            echo "Unknown Rust release target: $raw" >&2
            return 1
            ;;
    esac
}

rust_release_targets_for() {
    local target="$1"
    if [[ "$target" == "all" ]]; then
        echo "elata-muse-proto elata-eeg-hal elata-rppg elata-eeg-signal elata-eeg-models"
    else
        echo "$target"
    fi
}

rust_release_prereqs_for() {
    case "$1" in
        elata-muse-proto|elata-eeg-hal|elata-rppg)
            echo ""
            ;;
        elata-eeg-signal)
            echo "elata-eeg-hal"
            ;;
        elata-eeg-models)
            echo "elata-eeg-hal elata-eeg-signal"
            ;;
        *)
            echo "Unknown Rust crate target: $1" >&2
            return 1
            ;;
    esac
}

rust_crate_dir_for() {
    case "$1" in
        elata-muse-proto) echo "$ROOT_DIR/crates/elata-muse-proto" ;;
        elata-eeg-hal) echo "$ROOT_DIR/crates/elata-eeg-hal" ;;
        elata-eeg-signal) echo "$ROOT_DIR/crates/elata-eeg-signal" ;;
        elata-eeg-models) echo "$ROOT_DIR/crates/elata-eeg-models" ;;
        elata-rppg) echo "$ROOT_DIR/crates/elata-rppg" ;;
        *)
            echo "Unknown Rust crate target: $1" >&2
            return 1
            ;;
    esac
}

verify_rust_crate_docs() {
    local crate="$1"
    local crate_dir manifest readme_rel readme_path lib_rs

    crate_dir="$(rust_crate_dir_for "$crate")" || return 1
    manifest="$crate_dir/Cargo.toml"
    lib_rs="$crate_dir/src/lib.rs"

    if [[ ! -f "$manifest" ]]; then
        echo "Missing Cargo.toml for ${crate}: ${manifest}" >&2
        return 1
    fi

    readme_rel="$(sed -n 's/^readme = "\(.*\)"$/\1/p' "$manifest" | head -n1)"
    if [[ -n "$readme_rel" ]]; then
        readme_path="$crate_dir/$readme_rel"
        if [[ ! -f "$readme_path" ]]; then
            echo "Missing declared README for ${crate}: ${readme_path}" >&2
            return 1
        fi
    fi

    if [[ ! -f "$lib_rs" ]]; then
        echo "Missing crate root for ${crate}: ${lib_rs}" >&2
        return 1
    fi

    if ! rg -q '^//!' "$lib_rs"; then
        echo "Missing crate-level rustdoc in ${lib_rs}" >&2
        return 1
    fi

    cargo test --doc -p "$crate"
}

is_crate_published() {
    local crate="$1"
    cargo search "$crate" --limit 1 2>/dev/null | rg -q "^${crate} = "
}

verify_rust_crate_can_package() {
    local crate="$1"
    local prereqs

    RUST_PACKAGE_CHECK_MODE="package"
    prereqs="$(rust_release_prereqs_for "$crate")" || return 1
    if [[ -z "$prereqs" ]]; then
        cargo package -p "$crate" --allow-dirty --offline
        return 0
    fi

    local dep missing=0
    for dep in $prereqs; do
        if ! is_crate_published "$dep"; then
            echo "Skipping full packaging verify for ${crate}: prerequisite crate '${dep}' is not published on crates.io yet."
            missing=1
        fi
    done

    if [[ "$missing" -eq 1 ]]; then
        RUST_PACKAGE_CHECK_MODE="check-skip-prereq"
        cargo check -p "$crate"
    else
        RUST_PACKAGE_CHECK_MODE="package"
        cargo package -p "$crate" --allow-dirty --offline
    fi
}

rust_release_check_for_target() {
    local raw_target="${1:-all}"
    local target
    local crate docs_rc package_rc package_mode failed=0
    local docs_pass=0 docs_fail=0 package_pass=0 package_fail=0 package_skip=0
    local c_reset="" c_bold="" c_cyan="" c_green="" c_yellow="" c_red=""
    local -a check_summaries=()

    target="$(normalize_rust_release_target "$raw_target")" || exit 1
    require_cmds cargo rg
    if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
        c_reset=$'\033[0m'
        c_bold=$'\033[1m'
        c_cyan=$'\033[36m'
        c_green=$'\033[32m'
        c_yellow=$'\033[33m'
        c_red=$'\033[31m'
    fi

    for crate in $(rust_release_targets_for "$target"); do
        echo "Checking Rust crate docs for ${crate}..."
        set +e
        verify_rust_crate_docs "$crate"
        docs_rc=$?
        set -e
        if [[ "$docs_rc" -eq 0 ]]; then
            docs_pass=$((docs_pass + 1))
            check_summaries+=("PASS  ${crate} docs")
        else
            docs_fail=$((docs_fail + 1))
            failed=1
            check_summaries+=("FAIL  ${crate} docs")
            check_summaries+=("SKIP  ${crate} publishability (docs check failed)")
            package_skip=$((package_skip + 1))
            continue
        fi

        echo "Checking Rust crate publishability for ${crate}..."
        set +e
        verify_rust_crate_can_package "$crate"
        package_rc=$?
        package_mode="${RUST_PACKAGE_CHECK_MODE:-package}"
        set -e
        if [[ "$package_rc" -ne 0 ]]; then
            package_fail=$((package_fail + 1))
            failed=1
            check_summaries+=("FAIL  ${crate} publishability")
        elif [[ "$package_mode" == "check-skip-prereq" ]]; then
            package_skip=$((package_skip + 1))
            check_summaries+=("SKIP  ${crate} publishability (prerequisite crate(s) not on crates.io; ran cargo check)")
        else
            package_pass=$((package_pass + 1))
            check_summaries+=("PASS  ${crate} publishability")
        fi
    done

    printf "\n${c_bold}${c_cyan}Rust release-check summary${c_reset}\n"
    printf "  Docs checks: %s%d passed%s, %s%d failed%s\n" "$c_green" "$docs_pass" "$c_reset" "$c_red" "$docs_fail" "$c_reset"
    printf "  Publish checks: %s%d passed%s, %s%d skipped%s, %s%d failed%s\n" "$c_green" "$package_pass" "$c_reset" "$c_yellow" "$package_skip" "$c_reset" "$c_red" "$package_fail" "$c_reset"
    local summary_line=""
    for summary_line in "${check_summaries[@]}"; do
        case "$summary_line" in
            PASS\ *) printf "  ${c_green}%s${c_reset}\n" "$summary_line" ;;
            SKIP\ *) printf "  ${c_yellow}%s${c_reset}\n" "$summary_line" ;;
            FAIL\ *) printf "  ${c_red}%s${c_reset}\n" "$summary_line" ;;
            *) printf "  %s\n" "$summary_line" ;;
        esac
    done

    if [[ "$failed" -ne 0 ]]; then
        return 1
    fi
}

publish_rust_crates() {
    local raw_target="${1:-all}"
    local target
    local crate

    target="$(normalize_rust_release_target "$raw_target")" || exit 1
    require_cmds cargo rg
    ensure_crates_token_from_dotenv

    for crate in $(rust_release_targets_for "$target"); do
        echo "Publishing Rust crate ${crate}..."
        with_cargo_registry_auth cargo publish -p "$crate"
    done
}

rust_crate_version_for_target() {
    local crate="$1"
    local crate_dir manifest version
    crate_dir="$(rust_crate_dir_for "$crate")" || return 1
    manifest="$crate_dir/Cargo.toml"
    version="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$manifest" | head -n1)"
    if [[ -z "$version" ]]; then
        echo "Unable to determine version for Rust crate: $crate" >&2
        return 1
    fi
    printf "%s\n" "$version"
}

create_rust_release_tags() {
    local raw_target="${1:-all}"
    local commit="${2:-HEAD}"
    local target
    local crate
    local -a created=()

    target="$(normalize_rust_release_target "$raw_target")" || exit 1
    require_cmds git

    for crate in $(rust_release_targets_for "$target"); do
        local version tag
        version="$(rust_crate_version_for_target "$crate")"
        tag="${crate}-v${version}"

        if git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
            echo "Tag already exists, skipping: $tag"
            continue
        fi

        git tag "$tag" "$commit"
        created+=("$tag")
        echo "Created tag: $tag -> $commit"
    done

    if [[ ${#created[@]} -gt 0 ]]; then
        echo "Push tags with:"
        echo "  git push origin ${created[*]}"
    fi
}

push_rust_release_tags() {
    local raw_target="${1:-all}"
    local target
    local crate
    local -a tags_to_push=()

    target="$(normalize_rust_release_target "$raw_target")" || exit 1
    require_cmds git

    for crate in $(rust_release_targets_for "$target"); do
        local version tag
        version="$(rust_crate_version_for_target "$crate")"
        tag="${crate}-v${version}"

        if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
            echo "Missing local tag, skipping: $tag"
            continue
        fi
        tags_to_push+=("$tag")
    done

    if [[ ${#tags_to_push[@]} -eq 0 ]]; then
        echo "No matching local Rust release tags to push."
        return 0
    fi

    echo "Pushing Rust release tags to origin: ${tags_to_push[*]}"
    git push origin "${tags_to_push[@]}"
}

rust_release_commit_and_push_version_changes() {
    local raw_target="${1:-all}"
    local target

    target="$(normalize_rust_release_target "$raw_target")" || exit 1
    require_cmds git

    if ! git diff --cached --quiet >/dev/null; then
        die "Refusing to auto-commit during Rust release: you have staged changes already."
    fi

    local branch
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
        echo "Skipping git commit/push: detached HEAD."
        return 0
    fi

    local -a crate_entries=()
    local crate
    for crate in $(rust_release_targets_for "$target"); do
        local version
        version="$(rust_crate_version_for_target "$crate")"
        crate_entries+=("${crate}@${version}")
    done

    local version_part
    version_part="$(IFS=", "; echo "${crate_entries[*]}")"
    local commit_message="chore(rust-release): ${version_part}"

    local -a to_add=()
    [[ -f "$ROOT_DIR/Cargo.lock" ]] && to_add+=("$ROOT_DIR/Cargo.lock")
    for crate in $(rust_release_targets_for "$target"); do
        local crate_dir
        crate_dir="$(rust_crate_dir_for "$crate")"
        [[ -f "$crate_dir/Cargo.toml" ]] && to_add+=("$crate_dir/Cargo.toml")
    done

    if [[ ${#to_add[@]} -eq 0 ]]; then
        echo "No Rust version-related files found to commit."
        return 0
    fi

    git add "${to_add[@]}" >/dev/null 2>&1 || true
    if git diff --cached --quiet >/dev/null; then
        echo "No Rust version-related changes to commit."
        return 0
    fi

    echo "Committing Rust version bump(s): ${version_part}"
    git commit -m "$commit_message"

    local upstream
    upstream="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)"
    if [[ -n "$upstream" ]]; then
        git push
    else
        git push -u origin "$branch"
    fi
}

release_rust_crates() {
    local raw_target="${1:-all}"
    local target

    target="$(normalize_rust_release_target "$raw_target")" || exit 1
    rust_release_check_for_target "$target"
    publish_rust_crates "$target"
    rust_release_commit_and_push_version_changes "$target"
    create_rust_release_tags "$target" "HEAD"
    push_rust_release_tags "$target"
}

package_version_for_target() {
    local target="$1"
    local pkg_dir
    pkg_dir="$(package_dir_for_target "$target")"
    node -p "require('./${pkg_dir}/package.json').version"
}

sync_create_elata_demo_versions_if_needed() {
    # create-elata-demo embeds fallback SDK versions in its own package.json.
    # Ensure they match the repo's current package versions before publishing.
    require_cmds node

    local pkg_dir="packages/create-elata-demo"
    if [[ ! -d "$pkg_dir" ]]; then
        return 0
    fi

    local eeg_web_version eeg_web_ble_version rppg_web_version ppg_web_version
    eeg_web_version="$(package_version_for_target "eeg-web")"
    eeg_web_ble_version="$(package_version_for_target "eeg-web-ble")"
    rppg_web_version="$(package_version_for_target "rppg-web")"
    ppg_web_version="$(package_version_for_target "ppg-web")"

    local changed="0"
    changed="$(node -e "
      const fs = require('node:fs');
      const path = require('node:path');
      const file = path.join(process.cwd(), '$pkg_dir', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      const next = { ...(pkg.elataSdkVersions || {}) };
      const desired = {
        eegWeb: '$eeg_web_version',
        eegWebBle: '$eeg_web_ble_version',
        rppgWeb: '$rppg_web_version',
        ppgWeb: '$ppg_web_version',
      };
      let didChange = false;
      for (const [k, v] of Object.entries(desired)) {
        if (next[k] !== v) { next[k] = v; didChange = true; }
      }
      if (didChange) {
        pkg.elataSdkVersions = next;
        fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\\n', 'utf8');
        process.stdout.write('1');
      } else {
        process.stdout.write('0');
      }
    ")"

    if [[ "$changed" == "1" ]]; then
        echo "Detected SDK version drift in create-elata-demo; syncing elataSdkVersions and bumping patch..."
        (
            cd "$ROOT_DIR/$pkg_dir"
            pnpm version patch --no-git-tag-version
        )
    fi
}

validate_dist_tag() {
    case "$1" in
        next|latest) return 0 ;;
        *)
            echo "Unsupported npm dist-tag '$1'. Use: next or latest." >&2
            return 1
            ;;
    esac
}

bump_publish_packages() {
    local level="$1"
    local pkg

    case "$level" in
        major|minor|patch) ;;
        *)
            echo "Invalid semver bump level: $level (use: major, minor, patch)." >&2
            return 1
            ;;
    esac

    require_cmds pnpm node
    require_package_manager

    # Keep stdout clean: release/publish use read < <(resolve_release_target_and_dist_tag ...)
    # and only the final printf line may appear on stdout.
    echo "Semver bump (${level}) on all publishable packages (pnpm version --no-git-tag-version)." >&2
    echo "Tip: for changelog-driven releases, apply Changesets first with ./run.sh bump, then ./run.sh release without major|minor|patch." >&2
    for pkg in $(release_targets_for all); do
        local pkg_dir
        pkg_dir="$(package_dir_for_target "$pkg")"
        echo "  -> ${pkg}: pnpm version ${level}" >&2
        (
            cd "$ROOT_DIR/$pkg_dir"
            pnpm version "$level" --no-git-tag-version
        ) 1>&2
    done
}

resolve_release_target_and_dist_tag() {
    local raw_target="${1:-all}"
    local raw_dist_tag="${2:-latest}"

    case "$raw_target" in
        major|minor|patch)
            validate_dist_tag "$raw_dist_tag" || return 1
            bump_publish_packages "$raw_target" || return 1
            printf "all %s\n" "$raw_dist_tag"
            return 0
            ;;
    esac

    # Support shorthand like `./run.sh release latest`.
    if [[ -z "${2:-}" ]]; then
        case "$raw_target" in
            next|latest)
                printf "all %s\n" "$raw_target"
                return 0
                ;;
        esac
    fi

    printf "%s %s\n" "$raw_target" "$raw_dist_tag"
}

verify_script_for_target() {
    case "$1" in
        eeg-web|eeg-web-ble|rppg-web|ppg-web|create-elata-demo) echo "verify:publish" ;;
        *)
            echo "Unknown package target: $1" >&2
            return 1
            ;;
    esac
}

prepare_script_for_target() {
    case "$1" in
        eeg-web|eeg-web-ble|rppg-web|ppg-web|create-elata-demo) echo "prepare:publish" ;;
        *)
            echo "Unknown package target: $1" >&2
            return 1
            ;;
    esac
}

verify_release_contract_for_target() {
    local raw_target="${1:-all}"
    local target
    local pkg

    target="$(normalize_release_target "$raw_target")" || exit 1
    require_cmds node
    require_package_manager

    for pkg in $(release_targets_for "$target"); do
        local pkg_dir verify_script
        pkg_dir="$(package_dir_for_target "$pkg")"
        verify_script="$(verify_script_for_target "$pkg")"
        if [[ -n "$verify_script" ]]; then
            echo "Verifying publish artifacts for ${pkg}..."
            run_pkg_script "$pkg_dir" "$verify_script"
        fi
    done

    echo "Validating tarball contents for ${target}..."
    if [[ "$target" == "all" ]]; then
        node "$ROOT_DIR/scripts/validate-tarballs.mjs"
    else
        node "$ROOT_DIR/scripts/validate-tarballs.mjs" "$target"
    fi
}

publish_packages() {
    local raw_target="${1:-all}"
    local dist_tag="${2:-latest}"
    local skip_verify="${3:-0}"
    local target
    local pkg
    local pkg_dir pkg_name version
    target="$(normalize_release_target "$raw_target")" || exit 1
    validate_dist_tag "$dist_tag" || exit 1
    require_cmds node
    require_package_manager
    ensure_npm_token_from_dotenv
    verify_npm_token_or_die

    if [[ "$skip_verify" != "1" ]]; then
        verify_release_contract_for_target "$target"
    fi

    for pkg in $(release_targets_for "$target"); do
        if [[ "$pkg" == "create-elata-demo" ]]; then
            sync_create_elata_demo_versions_if_needed
        fi
        pkg_dir="$(package_dir_for_target "$pkg")"
        pkg_name="$(package_name_for_target "$pkg")"
        version="$(package_version_for_target "$pkg")"

        # If this exact version is already published, automatically bump patch
        # before attempting to publish, to avoid "cannot publish over previous version" errors.
        local remote_version=""
        if [[ "$PKG_MGR" == "pnpm" ]]; then
            remote_version="$(pnpm view "${pkg_name}@${version}" version 2>/dev/null || echo "")"
        else
            remote_version="$(npm view "${pkg_name}@${version}" version 2>/dev/null || echo "")"
        fi

        if [[ -n "$remote_version" ]]; then
            echo "Detected already published version for ${pkg_name}@${version}; bumping patch version before publish..."
            (
                cd "$ROOT_DIR/$pkg_dir"
                if [[ "$PKG_MGR" == "pnpm" ]]; then
                    pnpm version patch --no-git-tag-version
                else
                    npm version patch --no-git-tag-version
                fi
            )
            # Refresh version after bump
            version="$(package_version_for_target "$pkg")"
        fi

        echo "Publishing ${pkg_name}@${version} with dist-tag '${dist_tag}'..."
        (
            cd "$ROOT_DIR/$pkg_dir"
            if [[ "$PKG_MGR" == "pnpm" ]]; then
                with_npm_registry_auth pnpm publish --access public --tag "$dist_tag" --no-git-checks
            else
                with_npm_registry_auth npm publish --access public --tag "$dist_tag"
            fi
        )
    done
}

view_packages() {
    local raw_target="${1:-all}"
    local target
    local pkg
    local pkg_name

    target="$(normalize_release_target "$raw_target")" || exit 1
    require_cmds node
    require_package_manager

    for pkg in $(release_targets_for "$target"); do
        pkg_name="$(package_name_for_target "$pkg")"
        echo "Package: ${pkg_name}"
        if [[ "$PKG_MGR" == "pnpm" ]]; then
            pnpm view "$pkg_name" version
        else
            npm view "$pkg_name" version
        fi
        echo
    done
}

promote_latest() {
    local raw_target="${1:-all}"
    local target
    local pkg
    local pkg_name
    local version

    target="$(normalize_release_target "$raw_target")" || exit 1
    require_cmds npm node
    ensure_npm_token_from_dotenv

    for pkg in $(release_targets_for "$target"); do
        pkg_name="$(package_name_for_target "$pkg")"
        version="$(package_version_for_target "$pkg")"
        echo "Setting 'latest' dist-tag for ${pkg_name}@${version}..."
        with_npm_registry_auth npm dist-tag add "${pkg_name}@${version}" latest || {
            echo "Failed to set 'latest' for ${pkg_name}@${version} (is this version published?)." >&2
        }
    done
}

create_release_tags() {
    local raw_target="${1:-all}"
    local commit="${2:-HEAD}"
    local target
    local pkg
    local -a created=()

    target="$(normalize_release_target "$raw_target")" || exit 1
    require_cmds git node

    for pkg in $(release_targets_for "$target"); do
        local prefix version tag
        prefix="$(release_tag_prefix_for_target "$pkg")"
        version="$(package_version_for_target "$pkg")"
        tag="${prefix}-v${version}"

        if git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
            echo "Tag already exists, skipping: $tag"
            continue
        fi

        git tag "$tag" "$commit"
        created+=("$tag")
        echo "Created tag: $tag -> $commit"
    done

    if [[ ${#created[@]} -gt 0 ]]; then
        echo "Push tags with:"
        echo "  git push origin ${created[*]}"
    fi
}

push_release_tags() {
    local raw_target="${1:-all}"
    local target
    local pkg
    local -a tags_to_push=()

    target="$(normalize_release_target "$raw_target")" || exit 1
    require_cmds git node

    for pkg in $(release_targets_for "$target"); do
        local prefix version tag
        prefix="$(release_tag_prefix_for_target "$pkg")"
        version="$(package_version_for_target "$pkg")"
        tag="${prefix}-v${version}"

        if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null 2>&1; then
            echo "Missing local tag, skipping: $tag"
            continue
        fi
        tags_to_push+=("$tag")
    done

    if [[ ${#tags_to_push[@]} -eq 0 ]]; then
        echo "No matching local tags to push."
        return 0
    fi

    echo "Pushing tags to origin: ${tags_to_push[*]}"
    git push origin "${tags_to_push[@]}"
}

release_commit_and_push_version_changes() {
    local raw_target="${1:-all}"
    local dist_tag="${2:-latest}"
    local target

    target="$(normalize_release_target "$raw_target")" || exit 1
    require_cmds git node

    # Avoid surprising/accidental commits when the user has staged work.
    if ! git diff --cached --quiet >/dev/null; then
        die "Refusing to auto-commit during release: you have staged changes already."
    fi

    local branch
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
        echo "Skipping git commit/push: detached HEAD."
        return 0
    fi

    local -a pkg_entries=()
    local pkg
    for pkg in $(release_targets_for "$target"); do
        local pkg_name version
        pkg_name="$(package_name_for_target "$pkg")"
        version="$(package_version_for_target "$pkg")"
        pkg_entries+=("${pkg_name}@${version}")
    done

    local version_part
    version_part="$(IFS=", "; echo "${pkg_entries[*]}")"
    local commit_message="chore(release ${dist_tag}): ${version_part}"

    local -a to_add=()
    # Repo-level version bumps (changesets / pnpm version) often update these.
    [[ -f "$ROOT_DIR/package.json" ]] && to_add+=("$ROOT_DIR/package.json")
    [[ -f "$ROOT_DIR/pnpm-lock.yaml" ]] && to_add+=("$ROOT_DIR/pnpm-lock.yaml")

    for pkg in $(release_targets_for "$target"); do
        local pkg_dir
        pkg_dir="$(package_dir_for_target "$pkg")"
        [[ -f "$ROOT_DIR/$pkg_dir/package.json" ]] && to_add+=("$ROOT_DIR/$pkg_dir/package.json")
        [[ -f "$ROOT_DIR/$pkg_dir/CHANGELOG.md" ]] && to_add+=("$ROOT_DIR/$pkg_dir/CHANGELOG.md")
    done

    if [[ ${#to_add[@]} -eq 0 ]]; then
        echo "No version-related files found to commit."
        return 0
    fi

    git add "${to_add[@]}" >/dev/null 2>&1 || true
    if git diff --cached --quiet >/dev/null; then
        echo "No version-related changes to commit."
        return 0
    fi

    echo "Committing version bump(s): ${version_part}"
    git commit -m "$commit_message"

    local upstream
    upstream="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)"
    if [[ -n "$upstream" ]]; then
        git push
    else
        git push -u origin "$branch"
    fi
}

build_release_artifacts_for_target() {
    local target="$1"
    require_cmds node
    require_package_manager

    local normalized_target
    local pkg
    normalized_target="$(normalize_release_target "$target")" || exit 1

    for pkg in $(release_targets_for "$normalized_target"); do
        local pkg_dir prepare_script
        pkg_dir="$(package_dir_for_target "$pkg")"
        prepare_script="$(prepare_script_for_target "$pkg")"
        echo "Preparing publish artifacts for ${pkg}..."
        run_pkg_script "$pkg_dir" "$prepare_script"
    done
}

release_check_for_target() {
    local raw_target="${1:-all}"
    local target

    target="$(normalize_release_target "$raw_target")" || exit 1
    build_release_artifacts_for_target "$target"
    verify_release_contract_for_target "$target"
}

release_packages() {
    local raw_target="${1:-all}"
    local dist_tag="${2:-latest}"
    local target

    target="$(normalize_release_target "$raw_target")" || exit 1
    validate_dist_tag "$dist_tag" || exit 1

    release_check_for_target "$target"
    publish_packages "$target" "$dist_tag" 1
    # Any automated version patch-bumps that happen during publish (or
    # repo maintenance that syncs embedded fallback SDK versions) should be
    # committed so tags and git history line up.
    release_commit_and_push_version_changes "$target" "$dist_tag"
    create_release_tags "$target" "HEAD"
    push_release_tags "$target"
}

normalize_profile() {
    local profile="$1"
    case "$profile" in
        release|debug) printf "%s\n" "$profile" ;;
        dev) printf "debug\n" ;;
        build) printf "release\n" ;;
        *)
            echo "Unknown profile: $profile (use: release|debug|build|dev)" >&2
            return 1
            ;;
    esac
}

normalize_scaffold_template() {
    local raw="${1:-}"
    case "$raw" in
        "") printf "\n" ;;
        rppg|rppg-demo|rppg-web-demo) printf "rppg-demo\n" ;;
        ppg|ppg-demo|muse-ppg) printf "ppg-demo\n" ;;
        eeg|eeg-demo|eeg-web-demo) printf "eeg-demo\n" ;;
        eeg-ble|eeg-web-ble-demo|ble) printf "eeg-ble\n" ;;
        *)
            echo "Unknown scaffold template: $raw" >&2
            return 1
            ;;
    esac
}

run_create_demo() {
    require_cmds node

    local first_arg="${1:-}"
    local second_arg="${2:-}"
    local template=""
    local app_name=""
    shift 2 || true

    if [[ "$first_arg" == --* ]]; then
        node "$ROOT_DIR/packages/create-elata-demo/index.mjs" "$first_arg" "$second_arg" "$@"
        return 0
    fi

    if normalized_template="$(normalize_scaffold_template "$first_arg" 2>/dev/null)"; then
        template="$normalized_template"
        app_name="$second_arg"
    else
        app_name="$first_arg"
    fi

    if [[ -n "$template" && -z "$app_name" ]]; then
        node "$ROOT_DIR/packages/create-elata-demo/index.mjs" --template "$template"
        return 0
    fi

    if [[ -z "$app_name" ]]; then
        node "$ROOT_DIR/packages/create-elata-demo/index.mjs"
        return 0
    fi

    if [[ -n "$template" ]]; then
        node "$ROOT_DIR/packages/create-elata-demo/index.mjs" "$app_name" --template "$template"
        return 0
    fi

    node "$ROOT_DIR/packages/create-elata-demo/index.mjs" "$app_name"
}

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        die "Missing required command: $1" "Install '$1' and retry (try: ./run.sh doctor)."
    fi
}

require_cmds() {
    local cmd
    for cmd in "$@"; do
        require_cmd "$cmd"
    done
}

read_package_engine() {
    local key="$1"
    node -p "(() => { const pkg = require('./package.json'); return (pkg.engines && pkg.engines['$key']) || ''; })()"
}

extract_min_major() {
    local constraint="$1"
    if [[ "$constraint" =~ \>\=([0-9]+) ]]; then
        printf "%s\n" "${BASH_REMATCH[1]}"
        return 0
    fi
    return 1
}

extract_installed_major() {
    local version="$1"
    if [[ "$version" =~ ^v?([0-9]+) ]]; then
        printf "%s\n" "${BASH_REMATCH[1]}"
        return 0
    fi
    return 1
}

check_engine_major() {
    local tool="$1"
    local current_version="$2"
    local constraint="$3"
    local min_major installed_major
    if [[ -z "$constraint" ]]; then
        warn_line "$tool engine constraint missing from package.json"
        return 1
    fi
    if ! min_major="$(extract_min_major "$constraint")"; then
        warn_line "$tool engine constraint '$constraint' is not a simple >=major range"
        return 1
    fi
    if ! installed_major="$(extract_installed_major "$current_version")"; then
        err_line "unable to parse installed $tool version: $current_version"
        return 1
    fi
    if (( installed_major < min_major )); then
        err_line "$tool $current_version does not satisfy engines.$tool=$constraint"
        return 1
    fi
    ok_line "$tool version satisfies engines.$tool ($constraint)"
    return 0
}

init_package_manager() {
    if command -v pnpm >/dev/null 2>&1; then
        PKG_MGR="pnpm"
        return
    fi
    die "Missing required package manager: pnpm" "Install pnpm, then run: ./run.sh doctor"
}

require_package_manager() {
    if [[ -z "$PKG_MGR" ]]; then
        init_package_manager
    fi
}

run_pkg_script() {
    local pkg_dir="$1"
    local script="$2"
    shift 2
    run_pkg_cmd "$pkg_dir" run "$script" "$@"
}

run_pkg_cmd() {
    local pkg_dir="$1"
    shift
    require_package_manager
    if [[ "$PKG_MGR" == "pnpm" ]]; then
        pnpm --dir "$pkg_dir" "$@"
        return
    fi

    local npm_cmd="$1"
    shift
    case "$npm_cmd" in
        run)
            local script="$1"
            shift
            if [[ $# -gt 0 ]]; then
                npm --prefix "$pkg_dir" run "$script" -- "$@"
            else
                npm --prefix "$pkg_dir" run "$script"
            fi
            ;;
        add)
            local save_mode="save"
            if [[ "${1:-}" == "--save=false" ]]; then
                save_mode="no-save"
                shift
            fi
            if [[ "$save_mode" == "no-save" ]]; then
                npm --prefix "$pkg_dir" install --no-save "$@"
            else
                npm --prefix "$pkg_dir" install "$@"
            fi
            ;;
        *)
            echo "Unsupported npm fallback command: $npm_cmd" >&2
            exit 1
            ;;
    esac
}

run_root_script() {
    local script="$1"
    shift
    require_package_manager
    if [[ "$PKG_MGR" == "pnpm" ]]; then
        pnpm run "$script" "$@"
    else
        if [[ $# -gt 0 ]]; then
            npm run "$script" -- "$@"
        else
            npm run "$script"
        fi
    fi
}

run_and_capture() {
    local logfile="$1"
    shift

    set +e
    "$@" 2>&1 | tee "$logfile"
    local rc=${PIPESTATUS[0]}
    set -e
    return "$rc"
}

summarize_jest_log() {
    local label="$1"
    local logfile="$2"
    local suites tests

    suites="$(sed -nE 's/^Test Suites:[[:space:]]+([0-9]+) passed, ([0-9]+) total/\1\/\2/p' "$logfile" | tail -n 1)"
    tests="$(sed -nE 's/^Tests:[[:space:]]+([0-9]+) passed, ([0-9]+) total/\2/p' "$logfile" | tail -n 1)"

    if [[ -n "$suites" && -n "$tests" ]]; then
        printf "PASS  %s (%s suites, %s tests)\n" "$label" "$suites" "$tests"
        return 0
    fi

    printf "PASS  %s\n" "$label"
}

summarize_node_test_log() {
    local label="$1"
    local logfile="$2"
    local total passed

    total="$(sed -nE 's/^ℹ tests ([0-9]+)/\1/p' "$logfile" | tail -n 1)"
    passed="$(sed -nE 's/^ℹ pass ([0-9]+)/\1/p' "$logfile" | tail -n 1)"

    if [[ -n "$total" && -n "$passed" ]]; then
        printf "PASS  %s (%s/%s)\n" "$label" "$passed" "$total"
        return 0
    fi

    printf "PASS  %s\n" "$label"
}

run_test_command() {
    local logfile="$1"
    shift

    if [[ "${RUN_TEST_VERBOSE:-0}" == "1" ]]; then
        run_and_capture "$logfile" "$@"
        return $?
    fi

    if "$@" >"$logfile" 2>&1; then
        return 0
    fi

    # On failure, always print full captured output for diagnosis.
    cat "$logfile"
    return 1
}

install_local_package_into_app() {
    local app_dir="$1"
    local package_path="$2"
    local save="${3:-0}"
    require_package_manager

    if [[ "$save" == "1" ]]; then
        run_pkg_cmd "$app_dir" add "$package_path"
    else
        if [[ "$PKG_MGR" == "pnpm" ]]; then
            # pnpm add does not support --save=false; use link for ephemeral local installs.
            pnpm --dir "$app_dir" link "$package_path"
        else
            run_pkg_cmd "$app_dir" add --save=false "$package_path"
        fi
    fi
}

cpu_cores() {
    if command -v getconf >/dev/null 2>&1; then
        getconf _NPROCESSORS_ONLN && return 0
    fi
    if command -v sysctl >/dev/null 2>&1; then
        sysctl -n hw.ncpu && return 0
    fi
    echo 4
}

port_in_use() {
    local port="$1"

    if command -v lsof >/dev/null 2>&1; then
        lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi

    if command -v ss >/dev/null 2>&1; then
        ss -ltn "( sport = :$port )" 2>/dev/null | tail -n +2 | grep -q .
        return $?
    fi

    # Fallback: attempt to bind the port with Node.
    node -e '
      const net = require("net");
      const port = Number(process.argv[1]);
      const server = net.createServer();
      server.once("error", (err) => process.exit(err && err.code === "EADDRINUSE" ? 0 : 2));
      server.once("listening", () => server.close(() => process.exit(1)));
      server.listen(port, "127.0.0.1");
    ' "$port" >/dev/null 2>&1
    local rc=$?
    if [[ "$rc" -eq 0 ]]; then
        return 0
    fi
    if [[ "$rc" -eq 1 ]]; then
        return 1
    fi
    return 1
}

find_available_port() {
    local start_port="$1"
    local max_tries="${2:-30}"
    local port="$start_port"
    local i=0

    while [[ "$i" -lt "$max_tries" ]]; do
        if ! port_in_use "$port"; then
            echo "$port"
            return 0
        fi
        port=$((port + 1))
        i=$((i + 1))
    done

    return 1
}

ensure_sccache() {
    if command -v sccache >/dev/null 2>&1; then
        export RUSTC_WRAPPER="sccache"
    fi
}

build_eeg_wasm() {
    local profile="$1"
    local -a args=(--package "$EEG_PACKAGE" --target "$TARGET")

    if [[ "$profile" == "release" ]]; then
        args+=(--release)
    fi

    local jobs="${BUILD_JOBS:-$DEFAULT_JOBS}"
    if [[ -n "$jobs" ]]; then
        args+=("-j" "$jobs")
    fi

    echo "Building $EEG_PACKAGE ($profile) for $TARGET..."
    CARGO_INCREMENTAL=1 cargo build "${args[@]}"
}

eeg_wasm_path_for_profile() {
    local profile="$1"
    echo "$TARGET_DIR/$TARGET/$profile/eeg_wasm.wasm"
}

generate_eeg_bindings() {
    local profile="$1"
    local wasm_path
    wasm_path="$(eeg_wasm_path_for_profile "$profile")"

    if [[ ! -f "$wasm_path" ]]; then
        echo "WASM not found: $wasm_path" >&2
        echo "Run '$0 ${profile/release/build}' first." >&2
        exit 1
    fi

    mkdir -p "$EEG_BINDINGS_OUT_DIR"
    echo "Generating bindings into $EEG_BINDINGS_OUT_DIR..."
    wasm-bindgen "$wasm_path" --out-dir "$EEG_BINDINGS_OUT_DIR" --target web
}

build_eeg_web_package() {
    local profile="$1"

    require_cmds cargo wasm-bindgen node
    require_package_manager

    build_eeg_wasm "$profile"
    generate_eeg_bindings "$profile"
    run_pkg_script "packages/eeg-web" "sync-wasm"
    run_pkg_script "packages/eeg-web" "build"
}

build_rppg_web_package() {
    require_cmds cargo node
    require_package_manager

    # Produces demo/pkg wasm bindings + bundled demo JS.
    run_pkg_script "packages/rppg-web" "build:demo"
    # Build package declarations/runtime output.
    run_pkg_script "packages/rppg-web" "build"
}

build_targets() {
    local profile="$1"
    local target="$2"

    case "$target" in
        eeg)
            build_eeg_web_package "$profile"
            ;;
        rppg)
            build_rppg_web_package
            ;;
        all)
            build_eeg_web_package "$profile"
            build_rppg_web_package
            ;;
        *)
            echo "Unknown build target: $target" >&2
            usage
            exit 1
            ;;
    esac
}

run_rppg_demo() {
    require_cmds node
    require_package_manager

    # Build demo assets inside the repo (demo/*.js + demo/pkg/*), then serve from a temp dir so
    # you're not depending on the repo layout or existing generated files.
    run_pkg_script "packages/rppg-web" "build:demo"

    local requested_port="${PORT:-8080}"
    local port="$requested_port"
    if port_in_use "$requested_port"; then
        if [[ -n "${PORT:-}" ]]; then
            echo "PORT $requested_port is already in use." >&2
            echo "Stop the existing server or choose another port (example: PORT=$((requested_port + 1)) ./run.sh demo rppg)." >&2
            exit 1
        fi
        port="$(find_available_port "$requested_port" 30)" || {
            echo "No free port found in range $requested_port-$((requested_port + 29)). Set PORT explicitly and retry." >&2
            exit 1
        }
        echo "Port $requested_port is in use; using http://127.0.0.1:$port"
    fi

    local tmp_root="${TMP_DIR:-}"
    local tmp_dir=""
    if [[ -n "$tmp_root" ]]; then
        mkdir -p "$tmp_root"
        tmp_dir="$(mktemp -d "$tmp_root/elata-rppg-demo.XXXXXX")"
    else
        tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/elata-rppg-demo.XXXXXX")"
    fi

    if [[ "${KEEP_TMP:-0}" != "1" ]]; then
        trap 'rm -rf "$tmp_dir"' EXIT
    fi

    mkdir -p "$tmp_dir/demo"
    cp -R "$ROOT_DIR/packages/rppg-web/demo/." "$tmp_dir/demo/"

    echo "Serving rppg-web demo from temp dir: $tmp_dir"
    echo "  http://127.0.0.1:$port/index.html"
    echo "  http://127.0.0.1:$port/replay.html"
    echo "Tip: set KEEP_TMP=1 to keep the temp dir after exit."

    # Serve the copied demo directory. It contains pkg/ with the wasm bundle, so /pkg/* works.
    pnpm dlx http-server "$tmp_dir/demo" -p "$port" --silent
}

run_ppg_demo() {
    require_cmds cargo wasm-bindgen node
    require_package_manager

    local eeg_profile
    eeg_profile="$(normalize_profile "${PPG_DEMO_PROFILE:-${EEG_DEMO_PROFILE:-release}}")" || exit 1

    echo "Preparing EEG WASM artifacts for PPG Athena decode support (profile: $eeg_profile)..."
    build_eeg_web_package "$eeg_profile"

    run_pkg_script "packages/ppg-web" "build:demo"

    local requested_port="${PORT:-8081}"
    local port="$requested_port"
    if port_in_use "$requested_port"; then
        if [[ -n "${PORT:-}" ]]; then
            echo "PORT $requested_port is already in use." >&2
            echo "Stop the existing server or choose another port (example: PORT=$((requested_port + 1)) ./run.sh demo ppg)." >&2
            exit 1
        fi
        port="$(find_available_port "$requested_port" 30)" || {
            echo "No free port found in range $requested_port-$((requested_port + 29)). Set PORT explicitly and retry." >&2
            exit 1
        }
        echo "Port $requested_port is in use; using http://127.0.0.1:$port"
    fi

    local tmp_root="${TMP_DIR:-}"
    local tmp_dir=""
    if [[ -n "$tmp_root" ]]; then
        mkdir -p "$tmp_root"
        tmp_dir="$(mktemp -d "$tmp_root/elata-ppg-demo.XXXXXX")"
    else
        tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/elata-ppg-demo.XXXXXX")"
    fi

    if [[ "${KEEP_TMP:-0}" != "1" ]]; then
        trap 'rm -rf "$tmp_dir"' EXIT
    fi

    mkdir -p "$tmp_dir/demo"
    cp -R "$ROOT_DIR/packages/ppg-web/demo/." "$tmp_dir/demo/"

    echo "Serving ppg-web demo from temp dir: $tmp_dir"
    echo "  http://127.0.0.1:$port/index.html"
    echo "Tip: set KEEP_TMP=1 to keep the temp dir after exit."

    pnpm dlx http-server "$tmp_dir/demo" -p "$port" --silent
}

run_eeg_demo() {
    require_cmds cargo wasm-bindgen node
    require_package_manager

    local profile
    profile="$(normalize_profile "${EEG_DEMO_PROFILE:-release}")" || exit 1

    echo "Preparing EEG demo artifacts (profile: $profile)..."
    build_eeg_web_package "$profile"

    if [[ -d "packages/eeg-web-ble" && "${EEG_DEMO_BLE:-0}" == "1" ]]; then
        echo "Building packages/eeg-web-ble..."
        run_pkg_script "packages/eeg-web-ble" "build"
        if [[ "${EEG_DEMO_BLE_TEST:-0}" == "1" ]]; then
            echo "Running packages/eeg-web-ble tests..."
            run_pkg_script "packages/eeg-web-ble" "test" "--runInBand"
        fi
    fi

    local requested_port="${PORT:-4173}"
    local port="$requested_port"
    if port_in_use "$requested_port"; then
        if [[ -n "${PORT:-}" ]]; then
            echo "PORT $requested_port is already in use." >&2
            echo "Stop the existing server or choose another port (example: PORT=$((requested_port + 1)) ./run.sh demo eeg)." >&2
            exit 1
        fi
        port="$(find_available_port "$requested_port" 30)" || {
            echo "No free port found in range $requested_port-$((requested_port + 29)). Set PORT explicitly and retry." >&2
            exit 1
        }
        echo "Port $requested_port is in use; using http://127.0.0.1:$port"
    fi

    echo "Starting eeg-demo server on http://127.0.0.1:$port"
    if [[ "${EEG_DEMO_BLE:-0}" != "1" ]]; then
        echo "Tip: set EEG_DEMO_BLE=1 to also build packages/eeg-web-ble (and EEG_DEMO_BLE_TEST=1 to run tests)."
    fi
    (
        cd "$ROOT_DIR/eeg-demo"
        PORT="$port" node e2e/server.js
    )
}

run_hal_demo() {
    cargo run --example hal_demo
}

run_demo() {
    local demo="$1"
    case "$demo" in
        rppg) run_rppg_demo ;;
        ppg) run_ppg_demo ;;
        eeg) run_eeg_demo ;;
        hal) run_hal_demo ;;
        *) echo "Unknown demo: $demo" >&2; usage; exit 1 ;;
    esac
}

run_docs_site() {
    local docs_dir="$ROOT_DIR/elata-docs"
    local node_version="${ELATA_DOCS_NODE_VERSION:-22.22.1}"
    local -a mint_args=()

    require_package_manager

    if [[ ! -d "$docs_dir" ]]; then
        die "Docs site directory not found: $docs_dir" "Expected Mintlify project at elata-docs"
    fi

    echo "Validating Mintlify docs before launch..."
    run_root_script "docs:mintlify:check"

    if [[ $# -eq 0 ]]; then
        mint_args=(dev --no-open)
    else
        case "$1" in
            open)
                shift
                mint_args=(dev --open "$@")
                ;;
            dev)
                shift
                mint_args=(dev "$@")
                ;;
            *)
                mint_args=("$@")
                ;;
        esac
    fi

    if command -v volta >/dev/null 2>&1; then
        echo "Running Mintlify from $docs_dir with Volta Node $node_version..."
        (
            cd "$docs_dir"
            volta run --node "$node_version" pnpm dlx mint "${mint_args[@]}"
        )
        return
    fi

    echo "Running Mintlify from $docs_dir..."
    echo "Tip: if Mintlify rejects your Node version, install Volta or switch to an LTS Node release."
    (
        cd "$docs_dir"
        pnpm dlx mint "${mint_args[@]}"
    )
}

doctor() {
    set +e
    local toolchain_err=0
    local repo_err=0
    local deps_err=0
    local build_err=0

    local c_reset="" c_bold="" c_dim="" c_blue="" c_green="" c_yellow="" c_red="" c_cyan=""
    if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
        c_reset=$'\033[0m'
        c_bold=$'\033[1m'
        c_dim=$'\033[2m'
        c_blue=$'\033[34m'
        c_green=$'\033[32m'
        c_yellow=$'\033[33m'
        c_red=$'\033[31m'
        c_cyan=$'\033[36m'
    fi

    header() { printf "\n${c_bold}${c_blue}%s${c_reset}\n" "$1"; }
    ok_line() { printf "  ${c_green}[OK]${c_reset} %s\n" "$1"; }
    warn_line() { printf "  ${c_yellow}[!!]${c_reset} %s\n" "$1"; }
    err_line() { printf "  ${c_red}[XX]${c_reset} %s\n" "$1"; }
    info_line() { printf "  ${c_cyan}[..]${c_reset} %s\n" "$1"; }
    check_cmd() {
        local cmd="$1" success_msg="$2" fail_msg="$3"
        if command -v "$cmd" >/dev/null 2>&1; then
            ok_line "$success_msg"
            return 0
        fi
        err_line "$fail_msg"
        return 1
    }
    check_file() {
        local path="$1" ok_msg="$2" missing_msg="$3" severity="${4:-error}"
        if [[ -f "$path" ]]; then
            ok_line "$ok_msg"
            return 0
        fi
        if [[ "$severity" == "warn" ]]; then
            warn_line "$missing_msg"
            return 1
        fi
        err_line "$missing_msg"
        return 1
    }
    check_dir() {
        local path="$1" ok_msg="$2" missing_msg="$3"
        if [[ -d "$path" ]]; then
            ok_line "$ok_msg"
            return 0
        fi
        err_line "$missing_msg"
        return 1
    }
    printf "\n${c_bold}${c_cyan}Elata SDK Doctor${c_reset}\n"
    printf "${c_dim}Checks: toolchain, repo audit, package deps, generated artifacts${c_reset}\n"

    header "Toolchain"
    check_cmd "cargo" "cargo: $(cargo --version)" "cargo missing (install Rust via https://rustup.rs)" || toolchain_err=1

    if rustc --target "$TARGET" --print cfg >/dev/null 2>&1; then
        ok_line "rust target installed: $TARGET"
    else
        err_line "rust target missing: $TARGET (run: rustup target add $TARGET, or add it via your toolchain manager)"
        toolchain_err=1
    fi

    check_cmd "wasm-bindgen" "wasm-bindgen: $(wasm-bindgen --version)" "wasm-bindgen missing (run: cargo install wasm-bindgen-cli)" || toolchain_err=1
    check_cmd "node" "node: $(node --version)" "node missing (install from https://nodejs.org/)" || toolchain_err=1
    if command -v node >/dev/null 2>&1 && [[ -f "package.json" ]]; then
        check_engine_major "node" "$(node --version)" "$(read_package_engine node)" || toolchain_err=1
    fi

    require_package_manager
    if [[ "$PKG_MGR" == "pnpm" ]]; then
        ok_line "pnpm: $(pnpm --version) (selected)"
        if [[ -f "package.json" ]]; then
            check_engine_major "pnpm" "$(pnpm --version)" "$(read_package_engine pnpm)" || toolchain_err=1
        fi
        if [[ ! -f "pnpm-workspace.yaml" && -f "package.json" ]] && grep -q '"workspaces"' package.json; then
            warn_line "pnpm selected but pnpm-workspace.yaml is missing; add it to avoid workspace warnings"
        fi
    else
        err_line "package manager missing (install pnpm)"
        toolchain_err=1
    fi

    header "Repository Layout"
    check_file "Cargo.toml" "Cargo.toml: present" "Cargo.toml missing" || repo_err=1
    check_file "rust-toolchain.toml" "rust-toolchain.toml: present" "rust-toolchain.toml missing" || repo_err=1
    check_file "pnpm-lock.yaml" "pnpm-lock.yaml: present" "pnpm-lock.yaml missing" || repo_err=1
    check_dir "crates" "crates/: present" "crates/ missing" || repo_err=1
    check_dir "packages/eeg-web" "packages/eeg-web: present" "packages/eeg-web missing" || repo_err=1
    check_dir "packages/rppg-web" "packages/rppg-web: present" "packages/rppg-web missing" || repo_err=1
    check_dir "packages/ppg-web" "packages/ppg-web: present" "packages/ppg-web missing" || repo_err=1
    check_dir "packages/create-elata-demo" "packages/create-elata-demo: present" "packages/create-elata-demo missing" || repo_err=1

    header "Repository Audit"
    if [[ -f "package.json" ]]; then
        local audit_output audit_rc
        audit_output="$(run_root_script "audit:repo" 2>&1)"
        audit_rc=$?
        while IFS= read -r line; do
            printf "  ${c_dim}|${c_reset} %s\n" "$line"
        done <<< "$audit_output"
        if [[ $audit_rc -ne 0 ]]; then
            repo_err=1
        fi
    fi

    header "Package Dependencies"
    check_dir "node_modules" "node_modules/: present (pnpm workspace root)" "node_modules/ missing (run: pnpm install)" || deps_err=1

    header "Generated Artifacts"
    check_file "packages/eeg-web/dist/index.js" "packages/eeg-web/dist/index.js: present" "packages/eeg-web/dist/index.js missing" "warn" || build_err=1
    check_file "packages/eeg-web/wasm/eeg_wasm_bg.wasm" "packages/eeg-web/wasm/eeg_wasm_bg.wasm: present" "packages/eeg-web/wasm/eeg_wasm_bg.wasm missing" "warn" || build_err=1
    check_file "packages/rppg-web/dist/index.js" "packages/rppg-web/dist/index.js: present" "packages/rppg-web/dist/index.js missing" "warn" || build_err=1
    check_file "packages/ppg-web/dist/index.js" "packages/ppg-web/dist/index.js: present" "packages/ppg-web/dist/index.js missing" "warn" || build_err=1
    check_file "packages/rppg-web/demo/pkg/rppg_wasm_bg.wasm" "packages/rppg-web/demo/pkg/rppg_wasm_bg.wasm: present" "packages/rppg-web/demo/pkg/rppg_wasm_bg.wasm missing (optional; run './run.sh dev rppg' to generate)" "warn" || true
    check_file "packages/rppg-web/pkg/rppg_wasm.js" "packages/rppg-web/pkg/rppg_wasm.js: present (publishable loader)" "packages/rppg-web/pkg/rppg_wasm.js missing (run './run.sh build rppg' before publishing)" "warn" || build_err=1
    check_file "packages/rppg-web/pkg/rppg_wasm_bg.wasm" "packages/rppg-web/pkg/rppg_wasm_bg.wasm: present (publishable WASM)" "packages/rppg-web/pkg/rppg_wasm_bg.wasm missing (run './run.sh build rppg' before publishing)" "warn" || build_err=1

    header "Summary"
    if [[ $toolchain_err -eq 0 && $repo_err -eq 0 && $deps_err -eq 0 && $build_err -eq 0 ]]; then
        printf "  ${c_green}${c_bold}Repository looks healthy.${c_reset}\n"
        set -e
        return 0
    fi

    printf "  ${c_yellow}${c_bold}Doctor completed with issues.${c_reset}\n"
    if [[ $toolchain_err -ne 0 ]]; then
        info_line "install missing tools listed above"
    fi
    if [[ $deps_err -ne 0 ]]; then
        info_line "install web dependencies:"
        printf "    pnpm install   # from repo root\n"
    fi
    if [[ $build_err -ne 0 ]]; then
        info_line "rebuild artifacts:"
        printf "    ./run.sh dev eeg\n"
        printf "    ./run.sh dev rppg\n"
    fi

    set -e
    return 1
}
DEFAULT_JOBS="${BUILD_JOBS:-$(cpu_cores)}"
ensure_sccache

cmd="${1:-help}"
case "$cmd" in
    install)
        RUN_SH_TASK="install"
        require_package_manager
        pnpm install
        ;;
    doctor)
        RUN_SH_TASK="doctor"
        doctor
        ;;
    verify-all)
        RUN_SH_TASK="verify-all"
        # Run publish-level verification, including packaged wasm and tarball checks.
        run_root_script "verify:all"
        ;;
    rust-release-check)
        RUN_SH_TASK="rust-release-check"
        # Usage:
        #   ./run.sh rust-release-check [target]
        # Examples:
        #   ./run.sh rust-release-check all
        #   ./run.sh rust-release-check elata-rppg
        # Runs cargo package for standalone crates and cargo check when
        # crates.io prerequisite crates are not published yet.
        rust_release_check_for_target "${2:-all}"
        ;;
    rust-publish)
        RUN_SH_TASK="rust-publish"
        # Usage:
        #   ./run.sh rust-publish [target]
        # Examples:
        #   ./run.sh rust-publish all
        #   ./run.sh rust-publish elata-eeg-models
        # Runs: rust-release-check -> publish -> commit -> tag -> push-tags
        release_rust_crates "${2:-all}"
        ;;
    changeset)
        RUN_SH_TASK="changeset"
        require_cmds pnpm node
        (cd "$ROOT_DIR" && pnpm changeset)
        ;;
    bump)
        RUN_SH_TASK="bump"
        require_cmds pnpm node
        (cd "$ROOT_DIR" && pnpm run version)
        ;;
    release-check)
        RUN_SH_TASK="release-check"
        # Usage:
        #   ./run.sh release-check [target]
        # Examples:
        #   ./run.sh release-check all
        #   ./run.sh release-check rppg-web
        # Runs: build release artifacts -> verify publish contract -> validate tarballs
        release_check_for_target "${2:-all}"
        ;;
    release)
        RUN_SH_TASK="release"
        # Usage:
        #   ./run.sh release [target|major|minor|patch] [dist-tag]
        # Examples:
        #   ./run.sh release
        #   ./run.sh release patch
        #   ./run.sh release minor next
        #   ./run.sh release all next
        #   ./run.sh release latest
        #   ./run.sh release eeg-web latest
        # Runs: build -> publish -> tag-release -> push-tags
        read -r release_target release_dist_tag < <(resolve_release_target_and_dist_tag "${2:-all}" "${3:-}")
        release_packages "$release_target" "$release_dist_tag"
        ;;
    publish)
        RUN_SH_TASK="publish"
        # Usage:
        #   ./run.sh publish [target|major|minor|patch] [dist-tag]
        # Examples:
        #   ./run.sh publish
        #   ./run.sh publish patch
        #   ./run.sh publish all next
        #   ./run.sh publish latest
        #   ./run.sh publish eeg-web latest
        read -r publish_target publish_dist_tag < <(resolve_release_target_and_dist_tag "${2:-all}" "${3:-}")
        publish_packages "$publish_target" "$publish_dist_tag"
        ;;
    promote*)
        RUN_SH_TASK="promote"
        # Usage:
        #   ./run.sh promote [target]
        # Examples:
        #   ./run.sh promote all
        #   ./run.sh promote rppg-web
        # Sets the 'latest' npm dist-tag for the version currently in package.json.
        promote_latest "${2:-all}"
        ;;
    view)
        RUN_SH_TASK="view"
        # Usage:
        #   ./run.sh view [target]
        # Examples:
        #   ./run.sh view all
        #   ./run.sh view rppg-web
        # Shows latest published npm version(s) for the selected package(s).
        view_packages "${2:-all}"
        ;;
    tag-release)
        RUN_SH_TASK="tag-release"
        # Usage:
        #   ./run.sh tag-release [target] [commit]
        # Tags are derived from package.json versions:
        #   eeg-web-vX.Y.Z, eeg-web-ble-vX.Y.Z, rppg-web-vX.Y.Z
        create_release_tags "${2:-all}" "${3:-HEAD}"
        ;;
    push-tags)
        RUN_SH_TASK="push-tags"
        # Usage:
        #   ./run.sh push-tags [target]
        # Pushes existing local tags derived from package.json versions.
        push_release_tags "${2:-all}"
        ;;
    build)
        RUN_SH_TASK="build"
        build_targets release "${2:-all}"
        ;;
    docs)
        RUN_SH_TASK="docs"
        run_docs_site "${@:2}"
        ;;
    dev)
        RUN_SH_TASK="dev"
        build_targets debug "${2:-all}"
        ;;
    demo)
        RUN_SH_TASK="demo"
        run_demo "${2:-rppg}"
        ;;
    create)
        RUN_SH_TASK="create"
        # Usage:
        #   ./run.sh create [template] [app-name]
        #   ./run.sh create [app-name]
        # Examples:
        #   ./run.sh create rppg my-app
        #   ./run.sh create eeg my-app
        #   ./run.sh create eeg-ble my-app
        #   ./run.sh create my-app
        run_create_demo "${2:-}" "${3:-}"
        ;;
    bindings)
        RUN_SH_TASK="bindings"
        require_cmd wasm-bindgen
        profile="$(normalize_profile "${2:-release}")" || { usage; exit 1; }
        generate_eeg_bindings "$profile"
        ;;
    sync-to)
        RUN_SH_TASK="sync-to"
        # Usage: ./run.sh sync-to [app-path] [profile]
        #   APP_DIR env or first arg (default: ../my-app)
        #   profile: release|debug (default: release)
        APP_DIR_ARG="${2:-${APP_DIR:-$ROOT_DIR/../my-app}}"
        PROFILE_ARG="$(normalize_profile "${3:-release}")" || exit 1

        if [[ ! -d "$APP_DIR_ARG" ]]; then
            die "Target app directory not found: $APP_DIR_ARG" "Create the target or pass a different path: ./run.sh sync-to /path/to/app"
        fi

        echo "Building EEG web package (profile: $PROFILE_ARG) and syncing into $APP_DIR_ARG"
        build_eeg_web_package "$PROFILE_ARG"

        echo "Installing into app: $APP_DIR_ARG (using $PKG_MGR)"
        install_local_package_into_app "$APP_DIR_ARG" "$ROOT_DIR/packages/eeg-web" "${SAVE:-0}"

        echo "Sync complete: $ROOT_DIR/packages/eeg-web → $APP_DIR_ARG"
        ;;
    test)
        RUN_SH_TASK="test"
        require_package_manager
        declare -a test_summaries=()
        declare -a test_logs=()
        c_reset=""
        c_bold=""
        c_cyan=""
        c_green=""
        c_yellow=""
        if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
            c_reset=$'\033[0m'
            c_bold=$'\033[1m'
            c_cyan=$'\033[36m'
            c_green=$'\033[32m'
            c_yellow=$'\033[33m'
        fi
        print_test_section() {
            local title="$1"
            printf "\n${c_bold}${c_cyan}==> %s${c_reset}\n" "$title"
        }
        print_test_summary_line() {
            local line="$1"
            case "$line" in
                PASS*)
                    printf "${c_green}%s${c_reset}\n" "$line"
                    ;;
                SKIP*)
                    printf "${c_yellow}%s${c_reset}\n" "$line"
                    ;;
                *)
                    printf "%s\n" "$line"
                    ;;
            esac
        }

        create_test_log() {
            local logfile
            logfile="$(mktemp)"
            test_logs+=("$logfile")
            printf "%s\n" "$logfile"
        }

        cleanup_test_logs() {
            if [[ ${#test_logs[@]} -gt 0 ]]; then
                rm -f "${test_logs[@]}"
            fi
        }

        trap cleanup_test_logs EXIT

        if [[ "${2:-}" == "run-sh" ]]; then
            echo "Running run.sh error-handling self-tests..."
            bash "$ROOT_DIR/scripts/run-sh-tests.sh"
            exit 0
        fi

        if [[ "${2:-}" == "create-elata-demo" ]]; then
            if [[ ! -d "node_modules" ]]; then
                print_test_section "Installing workspace dependencies"
                echo "node_modules/ missing; running pnpm install at workspace root..."
                pnpm install
            fi

            print_test_section "RUNS  create-elata-demo tests (including template smoke builds)"
            log_file="$(create_test_log)"
            run_test_command "$log_file" run_pkg_script "packages/create-elata-demo" "test"
            test_summaries+=("$(summarize_node_test_log "create-elata-demo full smoke/build tests" "$log_file")")
            printf "\n${c_bold}Test summary${c_reset}\n"
            summary_line=""
            for summary_line in "${test_summaries[@]}"; do
                print_test_summary_line "$summary_line"
            done
            exit 0
        fi

        require_cmds cargo node
        local_jobs="${BUILD_JOBS:-$DEFAULT_JOBS}"

        print_test_section "RUNS  Rust workspace tests (unit + integration + doc)"
        rust_log="$(create_test_log)"
        run_test_command "$rust_log" cargo test --workspace -j "$local_jobs"
        test_summaries+=("PASS  Rust workspace (unit/integration/doc)")

        if [[ -d "packages/rppg-web" ]]; then
            print_test_section "RUNS  rppg-web Jest"
            rppg_log="$(create_test_log)"
            run_test_command "$rppg_log" run_pkg_script "packages/rppg-web" "test" "--runInBand"
            test_summaries+=("$(summarize_jest_log "rppg-web Jest suite" "$rppg_log")")
        fi

        if [[ -d "packages/ppg-web" ]]; then
            echo "Running ppg-web Jest tests..."
            ppg_log="$(create_test_log)"
            run_and_capture "$ppg_log" run_pkg_script "packages/ppg-web" "test" "--runInBand"
            test_summaries+=("$(summarize_jest_log "ppg-web Jest suite" "$ppg_log")")
        fi

        if [[ -d "packages/create-elata-demo" ]]; then
            print_test_section "RUNS  create-elata-demo smoke/build tests"
            create_demo_log="$(create_test_log)"
            run_test_command "$create_demo_log" run_pkg_script "packages/create-elata-demo" "test"
            test_summaries+=("$(summarize_node_test_log "create-elata-demo full smoke/build tests" "$create_demo_log")")
        fi

        if [[ -d "packages/eeg-web" ]]; then
            print_test_section "RUNS  eeg-web Jest"
            eeg_log="$(create_test_log)"
            run_test_command "$eeg_log" run_pkg_script "packages/eeg-web" "test" "--runInBand"
            test_summaries+=("$(summarize_jest_log "eeg-web Jest suite" "$eeg_log")")
        fi

        if [[ -d "packages/eeg-web-ble" ]]; then
            print_test_section "RUNS  eeg-web-ble Jest"
            eeg_ble_log="$(create_test_log)"
            run_test_command "$eeg_ble_log" run_pkg_script "packages/eeg-web-ble" "test" "--runInBand"
            test_summaries+=("$(summarize_jest_log "eeg-web-ble Jest suite" "$eeg_ble_log")")
        fi

        if [[ "${RUN_E2E:-0}" == "1" ]]; then
            print_test_section "RUNS  rppg-web Playwright e2e"
            run_pkg_script "packages/rppg-web" "ci:e2e"
            test_summaries+=("PASS  rppg-web Playwright e2e")
        else
            test_summaries+=("SKIP  rppg-web Playwright e2e (set RUN_E2E=1 to enable)")
        fi

        printf "\n${c_bold}Test summary${c_reset}\n"
        summary_line=""
        for summary_line in "${test_summaries[@]}"; do
            print_test_summary_line "$summary_line"
        done
        ;;
    clean)
        RUN_SH_TASK="clean"
        require_cmd cargo
        echo "Removing generated web bindings/bundles..."
        run_root_script "clean"
        rm -rf "$ROOT_DIR/eeg-demo/pkg"
        echo "Cleaning build artifacts for wasm crates..."
        cargo clean -p elata-eeg-wasm -p elata-rppg-wasm
        ;;
    format)
        RUN_SH_TASK="format"
        require_package_manager
        run_root_script "format"
        ;;
    format-check)
        RUN_SH_TASK="format-check"
        require_package_manager
        run_root_script "format:check"
        ;;
    __selftest_errtrap)
        RUN_SH_TASK="__selftest_errtrap"
        if [[ "${RUN_SH_INTERNAL_TEST:-0}" != "1" ]]; then
            die "Internal self-test command is disabled." "Run via: RUN_SH_INTERNAL_TEST=1 ./run.sh __selftest_errtrap"
        fi
        false
        ;;
    __selftest_requirecmd)
        RUN_SH_TASK="__selftest_requirecmd"
        if [[ "${RUN_SH_INTERNAL_TEST:-0}" != "1" ]]; then
            die "Internal self-test command is disabled." "Run via: RUN_SH_INTERNAL_TEST=1 ./run.sh __selftest_requirecmd"
        fi
        require_cmd "__definitely_missing_command__"
        ;;
    help|-h|--help)
        RUN_SH_TASK="help"
        usage
        ;;
    *)
        RUN_SH_TASK="$cmd"
        echo "Unknown command: $cmd" >&2
        usage
        exit 1
        ;;
esac
