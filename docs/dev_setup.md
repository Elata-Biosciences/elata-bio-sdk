# Developer Setup And Fast Iteration Tips

This short guide shows quick ways to speed up the Rust edit/build/test loop for this workspace.

## Repo requirements

- Node.js `>= 20`
- `pnpm` `>= 10`
- Rust toolchain via `rustup`

## Fast test & compile tips
- Run only the package you care about (fast):
  - `cargo check -p elata-rppg` (very fast, compile-only)
  - `cargo test -p elata-rppg --lib -j $BUILD_JOBS` (run only rppg library tests in parallel)

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
- Run the in-repo rPPG demo: `./run.sh demo rppg`
- Run the in-repo EEG demo: `./run.sh demo eeg`
- Run the native HAL example: `./run.sh demo hal`
- Run full workspace + web package tests: `./run.sh test`
- Preview the Mintlify docs site in `elata-docs/` (defaults to `mint dev --no-open`): `./run.sh docs`

## In-Repo Demo Behavior

Use the repo demos when you are developing the SDK itself, checking generated
artifacts, or debugging package integration inside this monorepo.

- `./run.sh demo rppg`
  - runs `packages/rppg-web` demo asset generation
  - copies the built demo to a temporary directory
  - serves that directory on `PORT`, default `8080`
  - supports `KEEP_TMP=1` if you want to inspect the served files after exit
- `./run.sh demo eeg`
  - builds `elata-eeg-wasm`
  - runs `wasm-bindgen`
  - syncs artifacts into `packages/eeg-web`
  - serves `eeg-demo/` on `PORT`, default `4173`
  - supports `EEG_DEMO_BLE=1` to also build `packages/eeg-web-ble`
  - supports `EEG_DEMO_BLE_TEST=1` to run BLE tests during that flow
- `./run.sh demo hal`
  - runs the Rust HAL example directly

Examples:

```bash
PORT=9000 ./run.sh demo rppg
KEEP_TMP=1 ./run.sh demo rppg
PORT=5000 EEG_DEMO_BLE=1 ./run.sh demo eeg
EEG_DEMO_BLE=1 EEG_DEMO_BLE_TEST=1 ./run.sh demo eeg
./run.sh demo hal
```

If you are validating the consumer experience instead of the repo-development
surface, use `create-elata-demo` rather than these in-repo demos.

## Notes
- If you add heavy dependencies to `elata-rppg` tests, test compile times will increase; keep dependencies minimal for unit tests.
- Consider adding selective feature flags for dev/test to reduce dependency compile footprint.
