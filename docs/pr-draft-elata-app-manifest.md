# PR Draft: Emit Elata app manifest for App Store verification

> **Status:** minimal design proposal. No code in this PR.

## PR title

feat: emit Elata app manifest for SDK usage detection

## Summary

Add a small `elata-manifest.json` file to generated browser app builds. The
manifest declares which Elata SDK packages the app depends on, giving the App
Store scanner a stable signal instead of relying only on minified bundle
inspection.

This is a declarative compatibility artifact, not a security boundary. If
fraud-resistant verification becomes necessary later, use package provenance
rather than a custom manifest signing or hashing scheme.

## Problem

The App Store currently checks built output to decide whether an uploaded app
uses the Elata SDK. That is fragile because:

- bundlers mangle function and class names, and split chunks unpredictably
- Vite absolute asset paths can resolve to the blob origin root instead of the
  uploaded release directory
- package imports can be tree-shaken or hidden behind generated code
- EEG and rPPG apps have different runtime surfaces

The scanner needs a simple SDK-owned build artifact that says which Elata
packages the app was built with.

## Proposed manifest

`create-elata-demo` generated apps write this file to the build output root:

```text
dist/elata-manifest.json
```

Example:

```json
{
  "schemaVersion": 1,
  "sdk": {
    "packages": [
      { "name": "@elata-biosciences/eeg-web", "version": "0.1.22" },
      { "name": "@elata-biosciences/eeg-web-ble", "version": "0.1.22" }
    ]
  }
}
```

## Field rules

- `schemaVersion` is required and starts at `1`.
- `sdk.packages` is required and lists detected `@elata-biosciences/*`
  dependencies.
- Each package entry has:
  - `name`: package name from `package.json`
  - `version`: resolved dependency version available to the generator
- Unknown top-level fields should be ignored by scanners so the format can grow
  later.

## SDK-side behavior

For v1, keep generation inside `create-elata-demo` rather than introducing a new
package or Vite plugin.

After the app build completes, the postbuild step:

1. Reads the app `package.json`.
2. Finds dependencies and dev dependencies whose names start with
   `@elata-biosciences/`.
3. Writes `dist/elata-manifest.json` with `schemaVersion` and `sdk.packages`.

If no Elata SDK packages are present, the generator should either skip writing
the file or write an empty `sdk.packages` array. Skipping the file is simpler and
matches the scanner fallback behavior.

## App Store scanner behavior

The scanner should:

1. Look for `elata-manifest.json` at the upload root.
2. If present, parse it and treat `sdk.packages` as the declared Elata SDK usage.
3. If absent, fall back to the current bundle scanning behavior.

The scanner may still run legacy bundle scanning for observability, but manifest
presence should be enough to answer "which Elata packages does this app declare?"

## Out of scope

- SDK anchor constants
- file hashes
- bundle evidence pointers
- capability derivation or cross-checking
- custom manifest signatures
- npm package provenance enforcement
- replacing legacy bundle scanning immediately
- a reusable Vite plugin or standalone manifest package

## Acceptance criteria

- `create-elata-demo` generated apps that depend on Elata SDK packages produce
  `dist/elata-manifest.json` after build.
- The manifest includes `schemaVersion: 1` and detected package names and
  versions.
- The App Store scanner reads the manifest when present.
- Manifest-less uploads continue through the existing bundle scanner.
- Existing apps can adopt the behavior by adding the same postbuild step.

## Suggested tests

- Unit test package detection from representative `package.json` files.
- Unit test that unrelated packages do not produce Elata package claims.
- Integration test at least one generated EEG app and one generated rPPG app:
  run the build and assert `dist/elata-manifest.json` contains the expected
  packages.
- Scanner test: manifest present uses declared packages.
- Scanner test: manifest absent falls back to legacy bundle scanning.

## App Store follow-up

In `elata-appstore`:

- Fetch `elata-manifest.json` alongside the uploaded app root.
- Parse the v1 shape.
- Store or display the declared package list in scan results.
- Keep the current bundle scanner as fallback for older uploads.

## Validation for this docs PR

Docs-only draft. No code validation required beyond markdown review.
