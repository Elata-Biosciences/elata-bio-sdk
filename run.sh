#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="wasm32-unknown-unknown"
EEG_PACKAGE="eeg-wasm"
EEG_BINDINGS_OUT_DIR="$ROOT_DIR/eeg-demo/pkg"
TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT_DIR/target}"
DEFAULT_JOBS=""
PKG_MGR=""

usage() {
    cat <<EOF
Usage: $0 [command] [target]

Commands:
  install    Install/update workspace dependencies
  dev        Build debug artifacts for 'eeg', 'rppg', or 'all' (default: all)
  build      Build release artifacts for 'eeg', 'rppg', or 'all' (default: all)
  demo       Run the demo - specify 'rppg' (default), 'hal', or 'eeg' (example: 'run.sh demo eeg')
  bindings   Generate bindings from an existing build (default: release)
  sync-to    Build eeg-web and install it into a local app (default app: ../my-app)
  doctor     Run repository health checks (toolchain, targets, package deps/artifacts)
  verify-all Run workspace JS/TS build + wasm verification
  release    Publish, create tags, and push tags (default: target=all, dist-tag=next)
  publish    Publish package(s) to npm in repo release order (default: target=all, dist-tag=next)
  tag-release Create package-scoped git tag(s) from package.json versions (default: target=all, commit=HEAD)
  push-tags  Push package-scoped git tag(s) for current package.json versions (default: target=all)
  test       Run Rust and web tests
  clean      Remove generated bindings and clean build artifacts
  help       Show this message
  (no args)  Alias for 'doctor'
EOF
}

normalize_release_target() {
    local raw="${1:-all}"
    case "$raw" in
        all) echo "all" ;;
        eeg|eeg-web|@elata-biosciences/eeg-web) echo "eeg-web" ;;
        eeg-web-ble|ble|@elata-biosciences/eeg-web-ble) echo "eeg-web-ble" ;;
        rppg|rppg-web|@elata-biosciences/rppg-web) echo "rppg-web" ;;
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
        echo "eeg-web eeg-web-ble rppg-web"
    else
        echo "$target"
    fi
}

package_version_for_target() {
    local target="$1"
    local pkg_dir
    pkg_dir="$(package_dir_for_target "$target")"
    node -p "require('./${pkg_dir}/package.json').version"
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

publish_packages() {
    local raw_target="${1:-all}"
    local dist_tag="${2:-next}"
    local target
    local pkg
    target="$(normalize_release_target "$raw_target")" || exit 1
    validate_dist_tag "$dist_tag" || exit 1
    require_cmds npm node

    for pkg in $(release_targets_for "$target"); do
        local pkg_dir pkg_name version
        pkg_dir="$(package_dir_for_target "$pkg")"
        pkg_name="$(package_name_for_target "$pkg")"
        version="$(package_version_for_target "$pkg")"
        echo "Publishing ${pkg_name}@${version} with dist-tag '${dist_tag}'..."
        (
            cd "$ROOT_DIR/$pkg_dir"
            npm publish --access public --tag "$dist_tag"
        )
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

release_packages() {
    local raw_target="${1:-all}"
    local dist_tag="${2:-next}"
    local target

    target="$(normalize_release_target "$raw_target")" || exit 1
    validate_dist_tag "$dist_tag" || exit 1

    publish_packages "$target" "$dist_tag"
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

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

require_cmds() {
    local cmd
    for cmd in "$@"; do
        require_cmd "$cmd"
    done
}

init_package_manager() {
    # Prefer npm for npm-workspaces repos unless pnpm workspace is explicitly configured.
    if [[ -f "$ROOT_DIR/pnpm-workspace.yaml" ]] && command -v pnpm >/dev/null 2>&1; then
        PKG_MGR="pnpm"
    elif command -v npm >/dev/null 2>&1; then
        PKG_MGR="npm"
    elif command -v pnpm >/dev/null 2>&1; then
        PKG_MGR="pnpm"
    else
        echo "Missing required package manager: pnpm or npm" >&2
        exit 1
    fi
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
    require_cmds cargo rustup node
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
    require_package_manager
    run_pkg_script "packages/rppg-web" "start-demo"

    # open "http://localhost:$port"
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
        eeg) run_eeg_demo ;;
        hal) run_hal_demo ;;
        *) echo "Unknown demo: $demo" >&2; usage; exit 1 ;;
    esac
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
    run_verify_check() {
        local pkg_dir="$1"
        local pkg_name="$2"
        local verify_output verify_rc
        verify_output="$(run_pkg_script "$pkg_dir" "verify:build" 2>&1)"
        verify_rc=$?
        while IFS= read -r line; do
            printf "  ${c_dim}|${c_reset} %s\n" "$line"
        done <<< "$verify_output"
        if [[ $verify_rc -eq 0 ]]; then
            ok_line "$pkg_name verify:build passed"
            return 0
        fi
        err_line "$pkg_name verify:build failed"
        return 1
    }

    printf "\n${c_bold}${c_cyan}Elata SDK Doctor${c_reset}\n"
    printf "${c_dim}Checks: toolchain, wasm target, package deps, generated artifacts${c_reset}\n"

    header "Toolchain"
    check_cmd "cargo" "cargo: $(cargo --version)" "cargo missing (install Rust via https://rustup.rs)" || toolchain_err=1

    if command -v rustup >/dev/null 2>&1; then
        ok_line "rustup: $(rustup --version 2>/dev/null | head -n 1)"
        if rustup target list --installed | grep -Fxq "$TARGET"; then
            ok_line "rust target installed: $TARGET"
        else
            err_line "rust target missing: $TARGET (run: rustup target add $TARGET)"
            toolchain_err=1
        fi
    else
        err_line "rustup missing (install Rust via https://rustup.rs)"
        toolchain_err=1
    fi

    check_cmd "wasm-bindgen" "wasm-bindgen: $(wasm-bindgen --version)" "wasm-bindgen missing (run: cargo install wasm-bindgen-cli)" || toolchain_err=1
    check_cmd "node" "node: $(node --version)" "node missing (install from https://nodejs.org/)" || toolchain_err=1

    require_package_manager
    if [[ "$PKG_MGR" == "pnpm" ]]; then
        ok_line "pnpm: $(pnpm --version) (selected)"
        if [[ ! -f "pnpm-workspace.yaml" && -f "package.json" ]] && grep -q '"workspaces"' package.json; then
            warn_line "pnpm selected but pnpm-workspace.yaml is missing; add it to avoid workspace warnings"
        fi
    elif command -v npm >/dev/null 2>&1; then
        ok_line "npm: $(npm --version) (selected)"
    else
        err_line "package manager missing (install pnpm or npm)"
        toolchain_err=1
    fi

    header "Repository Layout"
    check_file "Cargo.toml" "Cargo.toml: present" "Cargo.toml missing" || repo_err=1
    check_dir "crates" "crates/: present" "crates/ missing" || repo_err=1
    check_dir "packages/eeg-web" "packages/eeg-web: present" "packages/eeg-web missing" || repo_err=1
    check_dir "packages/rppg-web" "packages/rppg-web: present" "packages/rppg-web missing" || repo_err=1

    header "Package Dependencies"
    if [[ "$PKG_MGR" == "pnpm" ]]; then
        check_dir "node_modules" "node_modules/: present (pnpm workspace root)" "node_modules/ missing (run: pnpm install)" || deps_err=1
    else
        check_dir "node_modules" "node_modules/: present (npm workspace root)" "node_modules/ missing (run: npm install)" || deps_err=1
    fi

    header "Generated Artifacts"
    check_file "packages/eeg-web/dist/index.js" "packages/eeg-web/dist/index.js: present" "packages/eeg-web/dist/index.js missing" "warn" || build_err=1
    check_file "packages/eeg-web/wasm/eeg_wasm_bg.wasm" "packages/eeg-web/wasm/eeg_wasm_bg.wasm: present" "packages/eeg-web/wasm/eeg_wasm_bg.wasm missing" "warn" || build_err=1
    check_file "packages/rppg-web/dist/index.js" "packages/rppg-web/dist/index.js: present" "packages/rppg-web/dist/index.js missing" "warn" || build_err=1
    check_file "packages/rppg-web/demo/pkg/rppg_wasm_bg.wasm" "packages/rppg-web/demo/pkg/rppg_wasm_bg.wasm: present" "packages/rppg-web/demo/pkg/rppg_wasm_bg.wasm missing (optional; run './run.sh dev rppg' to generate)" "warn" || true

    header "Canned Checks"
    if [[ $deps_err -eq 0 && -d "packages/eeg-web" ]]; then
        run_verify_check "packages/eeg-web" "packages/eeg-web" || build_err=1
    else
        info_line "skipping packages/eeg-web verify:build (dependencies missing)"
    fi

    if [[ $deps_err -eq 0 && -d "packages/rppg-web" ]]; then
        run_verify_check "packages/rppg-web" "packages/rppg-web" || build_err=1
    else
        info_line "skipping packages/rppg-web verify:build (dependencies missing)"
    fi

    if [[ $deps_err -eq 0 && -d "packages/eeg-web-ble" ]]; then
        run_verify_check "packages/eeg-web-ble" "packages/eeg-web-ble" || build_err=1
    else
        info_line "skipping packages/eeg-web-ble verify:build (dependencies missing)"
    fi

    if [[ $deps_err -eq 0 && -f "package.json" ]]; then
        header "Workspace Verification"
        local verify_output verify_rc
        verify_output="$(run_root_script "verify:all" 2>&1)"
        verify_rc=$?
        while IFS= read -r line; do
            printf "  ${c_dim}|${c_reset} %s\n" "$line"
        done <<< "$verify_output"
        if [[ $verify_rc -ne 0 ]]; then
            build_err=1
        fi
    fi

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
        printf "    npm install   # from repo root (uses workspaces)\n"
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

cmd="${1:-doctor}"
case "$cmd" in
    install)
        require_package_manager
        if [[ "$PKG_MGR" == "pnpm" ]]; then
            pnpm install
        else
            npm install
        fi
        ;;
    doctor)
        doctor
        ;;
    verify-all)
        # Run the workspace-level JS/TS verification, including wasm checks for eeg-web.
        run_root_script "verify:all"
        ;;
    release)
        # Usage:
        #   ./run.sh release [target] [dist-tag]
        # Examples:
        #   ./run.sh release all next
        #   ./run.sh release eeg-web latest
        # Runs: publish -> tag-release -> push-tags
        release_packages "${2:-all}" "${3:-next}"
        ;;
    publish)
        # Usage:
        #   ./run.sh publish [target] [dist-tag]
        # Examples:
        #   ./run.sh publish all next
        #   ./run.sh publish eeg-web latest
        publish_packages "${2:-all}" "${3:-next}"
        ;;
    tag-release)
        # Usage:
        #   ./run.sh tag-release [target] [commit]
        # Tags are derived from package.json versions:
        #   eeg-web-vX.Y.Z, eeg-web-ble-vX.Y.Z, rppg-web-vX.Y.Z
        create_release_tags "${2:-all}" "${3:-HEAD}"
        ;;
    push-tags)
        # Usage:
        #   ./run.sh push-tags [target]
        # Pushes existing local tags derived from package.json versions.
        push_release_tags "${2:-all}"
        ;;
    build)
        build_targets release "${2:-all}"
        ;;
    dev)
        build_targets debug "${2:-all}"
        ;;
    demo)
        run_demo "${2:-rppg}"
        ;;
    bindings)
        require_cmd wasm-bindgen
        profile="$(normalize_profile "${2:-release}")" || { usage; exit 1; }
        generate_eeg_bindings "$profile"
        ;;
    sync-to)
        # Usage: ./run.sh sync-to [app-path] [profile]
        #   APP_DIR env or first arg (default: ../my-app)
        #   profile: release|debug (default: release)
        APP_DIR_ARG="${2:-${APP_DIR:-$ROOT_DIR/../my-app}}"
        PROFILE_ARG="$(normalize_profile "${3:-release}")" || exit 1

        if [[ ! -d "$APP_DIR_ARG" ]]; then
            echo "Target app directory not found: $APP_DIR_ARG" >&2
            echo "Create the target or pass a different path: ./run.sh sync-to /path/to/app" >&2
            exit 1
        fi

        echo "Building EEG web package (profile: $PROFILE_ARG) and syncing into $APP_DIR_ARG"
        build_eeg_web_package "$PROFILE_ARG"

        echo "Installing into app: $APP_DIR_ARG (using $PKG_MGR)"
        install_local_package_into_app "$APP_DIR_ARG" "$ROOT_DIR/packages/eeg-web" "${SAVE:-0}"

        echo "Sync complete: $ROOT_DIR/packages/eeg-web → $APP_DIR_ARG"
        ;;
    test)
        require_cmd cargo
        require_package_manager
        local_jobs="${BUILD_JOBS:-$DEFAULT_JOBS}"

        echo "Running Rust workspace tests (unit + integration + doc)..."
        cargo test --workspace -j "$local_jobs"

        # Build and verify rppg-web (ensure TypeScript outputs exist) before running tests
        if [[ -d "packages/rppg-web" ]]; then
            echo "Building packages/rppg-web..."
            run_pkg_script "packages/rppg-web" "build"
            echo "Verifying packages/rppg-web build outputs..."
            run_pkg_script "packages/rppg-web" "verify:build"
        fi

        echo "Running rppg-web Jest tests..."
        run_pkg_script "packages/rppg-web" "test" "--runInBand"

        # Verify rppg-web demo artifacts and optionally run Playwright e2e
        if [[ "${RUN_E2E:-0}" == "1" ]]; then
            echo "Running rppg-web Playwright e2e tests..."
            run_pkg_script "packages/rppg-web" "ci:e2e"
        else
            echo "Skipping Playwright e2e tests (set RUN_E2E=1 to enable)."
        fi

        # Build and verify other web packages (ensure built artifacts exist)
        if [[ -d "packages/eeg-web" ]]; then
            echo "Building packages/eeg-web..."
            run_pkg_script "packages/eeg-web" "build"
            echo "Verifying packages/eeg-web build outputs..."
            run_pkg_script "packages/eeg-web" "verify:build"
        fi

        # Build and package-validate eeg-web-ble before release/publish workflows
        if [[ -d "packages/eeg-web-ble" ]]; then
            echo "Building packages/eeg-web-ble..."
            run_pkg_script "packages/eeg-web-ble" "build"
            echo "Validating packages/eeg-web-ble pack output..."
            run_pkg_script "packages/eeg-web-ble" "pack:check"
            echo "Running eeg-web-ble Jest tests..."
            run_pkg_script "packages/eeg-web-ble" "test" "--runInBand"
        fi
        ;;
    clean)
        require_cmd cargo
        echo "Removing generated web bindings/bundles..."
        rm -rf \
            "$ROOT_DIR/eeg-demo/pkg" \
            "$ROOT_DIR/packages/rppg-web/demo/pkg" \
            "$ROOT_DIR/packages/rppg-web/demo/demo.js"
        find "$ROOT_DIR/packages/eeg-web/wasm" -mindepth 1 -maxdepth 1 ! -name ".gitkeep" -exec rm -rf {} +
        echo "Cleaning build artifacts for wasm crates..."
        cargo clean -p eeg-wasm -p rppg-wasm
        ;;
    help|-h|--help)
        usage
        ;;
    *)
        echo "Unknown command: $cmd" >&2
        usage
        exit 1
        ;;
esac
