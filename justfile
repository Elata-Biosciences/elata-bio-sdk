set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set positional-arguments

# All recipes source the shared task-runner library (scripts/run-lib.sh), which
# is the single source of truth for command logic. Sourcing it runs the command
# dispatch against the positional parameters we set with `set --`, so
# `just <cmd>` and `./run.sh <cmd>` execute identical code.

lib := justfile_directory() / "scripts/run-lib.sh"

# Show the available commands.
default:
    @just --list

# --- Build & Demo -----------------------------------------------------------

# Install/update workspace dependencies.
install:
    @set -- install; source "{{lib}}"

# Build debug artifacts for 'eeg', 'rppg', or 'all' (default: all).
dev target="all":
    @set -- dev "{{target}}"; source "{{lib}}"

# Build release artifacts for 'eeg', 'rppg', or 'all' (default: all).
build target="all":
    @set -- build "{{target}}"; source "{{lib}}"

# Generate bindings from an existing build (default: release).
bindings profile="release":
    @set -- bindings "{{profile}}"; source "{{lib}}"

# Run internal Mintlify docs tooling (default: 'mint dev --no-open').
docs *args:
    @set -- docs "$@"; source "{{lib}}"

# Run in-repo demo: 'rppg' (default), 'ppg', 'hal', or 'eeg'.
demo target="rppg":
    @set -- demo "{{target}}"; source "{{lib}}"

# Scaffold an app via create-elata-demo (e.g. `just create ppg my-app`).
create *args:
    @set -- create "$@"; source "{{lib}}"

# Build eeg-web and install it into a local app (default app: ../my-app).
sync-to *args:
    @set -- sync-to "$@"; source "{{lib}}"

# --- Quality ----------------------------------------------------------------

# Run fast health checks (toolchain, repo audit, deps, artifact presence).
doctor:
    @set -- doctor; source "{{lib}}"

# Run publish-grade verification for release artifacts and tarballs.
verify-all:
    @set -- verify-all; source "{{lib}}"

# Run Rust and web test suites.
test *args:
    @set -- test "$@"; source "{{lib}}"

# Format files with Biome.
format:
    @set -- format; source "{{lib}}"

# Run Biome format check (no write).
format-check:
    @set -- format-check; source "{{lib}}"

# --- Release ----------------------------------------------------------------

# Add a changeset (interactive; run before opening a PR).
changeset:
    @set -- changeset; source "{{lib}}"

# Apply changesets: bump versions and update CHANGELOGs.
bump:
    @set -- bump; source "{{lib}}"

# Run full release preflight without publishing (default target: all).
release-check target="all":
    @set -- release-check "{{target}}"; source "{{lib}}"

# Build, publish, tag, and push (default: all + npm tag latest).
release target="all" dist_tag="":
    @set -- release "{{target}}" "{{dist_tag}}"; source "{{lib}}"

# Publish package(s) to npm in repo release order (default: all + latest).
publish target="all" dist_tag="":
    @set -- publish "{{target}}" "{{dist_tag}}"; source "{{lib}}"

# Promote selected package version(s) to npm 'latest' dist-tag.
promote target="all":
    @set -- promote "{{target}}"; source "{{lib}}"

# Show latest published npm version(s) for selected package(s).
view target="all":
    @set -- view "{{target}}"; source "{{lib}}"

# Create package-scoped git tag(s) from package.json versions.
tag-release target="all" commit="HEAD":
    @set -- tag-release "{{target}}" "{{commit}}"; source "{{lib}}"

# Push package-scoped git tag(s) for current package.json versions.
push-tags target="all":
    @set -- push-tags "{{target}}"; source "{{lib}}"

# Verify Rust crates are ready to publish to crates.io (default target: all).
rust-release-check target="all":
    @set -- rust-release-check "{{target}}"; source "{{lib}}"

# Run Rust release flow: check, publish, commit, tag, and push (default: all).
rust-publish target="all":
    @set -- rust-publish "{{target}}"; source "{{lib}}"

# --- Maintenance ------------------------------------------------------------

# Remove generated bindings and clean build artifacts.
clean:
    @set -- clean; source "{{lib}}"

# Show the run.sh-style command reference.
help:
    @set -- help; source "{{lib}}"
