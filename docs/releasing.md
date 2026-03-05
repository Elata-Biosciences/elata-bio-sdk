# Releasing NPM Packages

This repository publishes web packages independently:

- `@elata-biosciences/eeg-web`
- `@elata-biosciences/eeg-web-ble`
- `@elata-biosciences/rppg-web`

Release order matters because `@elata-biosciences/eeg-web-ble` depends on `@elata-biosciences/eeg-web`.

## Versioning and Order

1. `@elata-biosciences/eeg-web`
2. `@elata-biosciences/eeg-web-ble`
3. `@elata-biosciences/rppg-web`

Use SemVer and bump only the packages that changed.

## Pre-Release Checklist

1. Run repository checks:

```bash
./run.sh doctor
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
