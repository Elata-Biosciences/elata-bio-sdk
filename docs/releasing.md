# Releasing Packages

This repository publishes npm packages independently:

- `@elata-biosciences/eeg-web`
- `@elata-biosciences/eeg-web-ble`
- `@elata-biosciences/rppg-web`
- `@elata-biosciences/ppg-web`
- `@elata-biosciences/create-elata-demo`

We use [Changesets](https://github.com/changesets/changesets) for versioning and changelogs. Contributors add changesets in PRs; maintainers bump versions and release.

The repository also contains Rust crates that can be packaged and published to
`crates.io`. Rust crate versioning is currently managed through the `Cargo.toml`
files rather than Changesets.

## Quick reference

| Step | Command |
|------|---------|
| Add a changeset (contributor) | `./run.sh changeset` |
| Apply changesets & update CHANGELOGs (maintainer) | `./run.sh bump` |
| Run release preflight only | `./run.sh release-check all` |
| Build, publish, tag, push (maintainer) | `./run.sh release` (defaults to `all` + npm dist-tag `latest`) |
| Same with explicit semver bump on every package first | `./run.sh release patch`, `./run.sh release minor`, or `./run.sh release major` |
| Prerelease npm dist-tag | `./run.sh release all next` (or `./run.sh release next`) |

See also: `.changeset/README.md` in the repo root.

## Rust crates

Public Rust crates we intend to support on `crates.io`:

- `elata-muse-proto`
- `elata-eeg-hal`
- `elata-eeg-signal`
- `elata-eeg-models`
- `elata-rppg`

Internal or packaging-specific crates such as `elata-dev-eeg-synthetic`,
`elata-dev-synthetic-ble-bridge`, `elata-eeg-wasm`, `elata-eeg-ffi`, `elata-rppg-wasm`,
`elata-rppg-ffi`, and `elata-facial-affect` are marked `publish = false`.

The workspace root crate `eeg-sdk` is also an internal workspace convenience
crate and is marked `publish = false`.

### Rust release checklist

1. Update crate versions in the relevant `Cargo.toml` files.
2. Verify packaging locally from the repo root:

```bash
./run.sh rust-release-check all
```

This check now validates crate documentation basics too:

- declared crate `README.md` files must exist
- `src/lib.rs` must include crate-level rustdoc
- crate doctests must pass
- `cargo package` still runs when dependency ordering allows it

3. Publish in dependency order so crates that depend on internal crates can
   resolve the new versions from `crates.io`.

If a crate depends on another workspace crate that has not been published yet,
`cargo package` may fail verification while trying to resolve that dependency
from `crates.io`. In practice:

- use `cargo package` normally for crates with no unpublished internal dependencies
- publish the foundational crates first
- then re-run `cargo package` or `cargo publish --dry-run` for dependent crates

Recommended publish order:

1. `elata-muse-proto`
2. `elata-eeg-hal`
3. `elata-rppg`
4. `elata-eeg-signal`
5. `elata-eeg-models`

Example publish commands:

```bash
./run.sh rust-publish all
./run.sh rust-publish elata-rppg
./run.sh rust-publish elata-eeg-models
```

`./run.sh rust-publish ...` supports token-based auth via `CRATES_TOKEN` in the
repo-root `.env` (mapped to `CARGO_REGISTRY_TOKEN` for `cargo publish`), or a
pre-set `CARGO_REGISTRY_TOKEN` environment variable.

`./run.sh rust-publish ...` also mirrors the npm release ergonomics: it runs
`rust-release-check`, publishes in dependency order, commits detected Rust
version-file updates, creates crate-scoped tags (`<crate>-vX.Y.Z`), and pushes
the commit/tags.

## Release workflow (maintainers)

1. **Apply changesets** (bump versions and update CHANGELOGs):
   ```bash
   ./run.sh bump
   ```
2. Review the diff (package.json versions and `CHANGELOG.md` in each package), then commit.
3. **Run the release preflight**:
   ```bash
   ./run.sh release-check all
   ```
4. **Build and publish**:
   ```bash
   ./run.sh release
   ```
   This publishes with npm dist-tag **`latest`** by default. Use `./run.sh release all next` or `./run.sh release next` when you intend the **`next`** dist-tag instead.

   Optional shorthand when you want a raw semver bump on **every** publishable package before publishing (same order as below): `./run.sh release patch`, `./run.sh release minor`, or `./run.sh release major`. Prefer `./run.sh bump` first when you are cutting a **Changesets** release so changelogs stay accurate.

Release order is fixed in `run.sh`: `eeg-web` → `eeg-web-ble` → `rppg-web` → `ppg-web` → `create-elata-demo`.
`eeg-web-ble` must follow `eeg-web` because it has an `eeg-web` peer dependency.

## Contributors: adding a changeset

When your PR changes something that should be released, run **`./run.sh changeset`** (or `pnpm changeset`) and follow the prompts. Commit the new file under `.changeset/` with your PR.

## Pre-Release Checklist (optional)

1. Run repository checks and build all packages:

```bash
./run.sh doctor
./run.sh build
```

2. Run package dry runs from repo root:

```bash
pnpm --dir packages/eeg-web pack --dry-run --json
pnpm --dir packages/eeg-web-ble pack --dry-run --json
pnpm --dir packages/rppg-web pack --dry-run --json
pnpm --dir packages/create-elata-demo pack --dry-run --json
```

3. Validate tarball contents before publish:

- no test-only files
- no local-only demo artifacts unless intentionally shipped
- expected entry points and type declarations are present
- required packaged WASM assets are present for `eeg-web` and `rppg-web`

`prepack` now rebuilds and verifies publishable artifacts for the published
packages, but maintainers should still run the repo-level checks above before
publishing.

## Safe Publish Flow

Publish to a non-`latest` channel first:

```bash
# example for one package
cd packages/rppg-web
npm publish --access public --tag next
```

After verification, promote to `latest`:

```bash
npm dist-tag add @elata-biosciences/rppg-web@0.1.1 latest
```

Repeat for each package/version you want to promote.

## Git Tagging

Use package-scoped git tags in this monorepo:

- `eeg-web-vX.Y.Z`
- `eeg-web-ble-vX.Y.Z`
- `rppg-web-vX.Y.Z`
- `create-elata-demo-vX.Y.Z`

Example:

```bash
git tag eeg-web-v0.1.2
git push origin eeg-web-v0.1.2
```

## If a Bad Version Is Published

You cannot overwrite an existing version number. Do this instead:

1. Deprecate the bad version:

```bash
npm deprecate @elata-biosciences/rppg-web@0.1.1 "Broken build; use >=0.1.2"
```

2. Publish a fixed patch version.
3. Move `latest` to the fixed version with `npm dist-tag add`.

`npm unpublish` is restricted and should not be part of normal recovery.
