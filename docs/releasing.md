# Releasing NPM Packages

This repository publishes web packages independently:

- `@elata-biosciences/eeg-web`
- `@elata-biosciences/eeg-web-ble`
- `@elata-biosciences/rppg-web`

We use [Changesets](https://github.com/changesets/changesets) for versioning and changelogs. Contributors add changesets in PRs; maintainers bump versions and release.

## Quick reference

| Step | Command |
|------|---------|
| Add a changeset (contributor) | `./run.sh changeset` |
| Apply changesets & update CHANGELOGs (maintainer) | `./run.sh bump` |
| Build, publish, tag, push (maintainer) | `./run.sh release all next` or `./run.sh release all latest` |

See also: `.changeset/README.md` in the repo root.

## Release workflow (maintainers)

1. **Apply changesets** (bump versions and update CHANGELOGs):
   ```bash
   ./run.sh bump
   ```
2. Review the diff (package.json versions and `CHANGELOG.md` in each package), then commit.
3. **Build and publish**:
   ```bash
   ./run.sh release all next
   ```
   Or use `latest` as the second argument to publish as the default dist-tag.

Release order is fixed: eeg-web → eeg-web-ble → rppg-web (eeg-web-ble has eeg-web as a peer dependency).

## Contributors: adding a changeset

When your PR changes something that should be released, run **`./run.sh changeset`** (or `pnpm changeset`) and follow the prompts. Commit the new file under `.changeset/` with your PR.

## Pre-Release Checklist (optional)

1. Run repository checks and build all packages (prepack only verifies; it does not build):

```bash
./run.sh doctor
./run.sh build
```

2. Run package dry runs from repo root:

```bash
cd packages/eeg-web
npm_config_cache=${NPM_CONFIG_CACHE:-/tmp/npm-cache} npm pack --dry-run

cd ../eeg-web-ble
npm_config_cache=${NPM_CONFIG_CACHE:-/tmp/npm-cache} npm pack --dry-run

cd ../rppg-web
npm_config_cache=${NPM_CONFIG_CACHE:-/tmp/npm-cache} npm pack --dry-run
```

3. Validate tarball contents before publish:

- no test-only files
- no local-only demo artifacts unless intentionally shipped
- expected entry points and type declarations are present

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
