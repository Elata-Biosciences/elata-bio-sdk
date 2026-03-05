# Developer Setup & Fast Iteration Tips ⚡

This short guide shows quick ways to speed up the Rust edit/build/test loop for this workspace.

## Fast test & compile tips
- Run only the package you care about (fast):
  - `cargo check -p rppg` (very fast, compile-only)
  - `cargo test -p rppg --lib -j $BUILD_JOBS` (run only rppg library tests in parallel)

- Prefer `cargo check` for most iterations and `cargo test` when you need to run tests.

## Use sccache (recommended)
- Install `sccache` on macOS: `brew install sccache` or follow platform instructions.
- Verify it's working:
  - `sccache --show-stats`
  - `export RUSTC_WRAPPER=$(which sccache)` (add to your shell profile)
- `run.sh` calls `ensure_sccache` and will set `RUSTC_WRAPPER=sccache` automatically if available.

## Use a persistent target dir (CI / long-running dev machines)
- Save and reuse `target` across runs/branches to avoid recompiling crate dependencies:
  - `export CARGO_TARGET_DIR=~/.cache/elata/cargo-target`
- Configure your CI to cache that folder between runs.

## Workspace profile tuning
- This repository provides conservative `[profile.dev]` and `[profile.test]` settings in `Cargo.toml` to enable incremental builds and multiple codegen units.
- These help reduce rebuild time at the cost of a slightly different dev binary than `--release`.

## Useful `run.sh` shortcuts
- Build web artifacts (debug): `./run.sh dev [eeg|rppg|all]`
- Build web artifacts (release): `./run.sh build [eeg|rppg|all]`
- Generate bindings only: `./run.sh bindings [release|debug]`
- Run full workspace + web package tests: `./run.sh test`

## Notes
- If you add heavy dependencies to `rppg` tests, test compile times will increase; keep dependencies minimal for unit tests.
- Consider adding selective feature flags for dev/test to reduce dependency compile footprint.

Happy hacking — ping me to add CI caching steps or remote sccache configuration. 🚀