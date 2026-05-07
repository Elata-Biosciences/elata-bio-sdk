# PR Draft: Emit Elata app manifest for App Store verification

> **Status:** design proposal. No code in this PR. Open decisions below must be resolved before implementation starts.

## Decisions needed before implementation

These two are load-bearing for the design and need a call before we cut code:

1. **Anchor survival in the SDK publish pipeline.** SDK anchor constants must survive minification and tree-shaking across all bundlers an app might use (Vite/Rollup, Webpack, esbuild). The whole evidence-verification scheme collapses silently if a future toolchain drops the anchor as dead code.
   - **Recommendation:** the SDK's own publish pipeline hard-fails (CI red, no `npm publish`) when the anchor is missing from its own production `dist/` output. Add a CI step that builds each SDK package in production mode and greps for the anchor constant.
   - **Alternative:** soft-warn only and rely on integration tests in `create-elata-demo`. Rejected — too easy to ship a broken release.
   - **Owner / decision needed:** _TBD_.

2. **JSON Schema hosting location.** The manifest references its schema by URL (`$schema` field). The placeholder in this doc is `https://schemas.elata.bio/elata-manifest/v1.json`. We need to decide where the schema actually lives before this can ship.
   - **Options:**
     - **GitHub Pages on this repo** (e.g., `https://elata-biosciences.github.io/elata-bio-sdk/schemas/elata-manifest/v1.json`). Cheapest, no new infra. Couples schema URL to the SDK repo name.
     - **Dedicated subdomain** (`schemas.elata.bio`). Cleanest, decoupled from repo, requires DNS + hosting setup.
     - **Path under an existing Elata domain** (e.g., `https://elata.bio/schemas/elata-manifest/v1.json`). Middle ground; depends on how the main site is deployed.
   - **Recommendation:** GitHub Pages on this repo for v1; revisit if Elata ever needs to publish multiple schemas.
   - **Owner / decision needed:** _TBD_.

## PR title

feat: emit Elata app manifest for SDK usage verification

## Summary

Add a durable `elata-manifest.json` contract that SDK tooling generates into browser app builds. The App Store scanner uses the manifest to locate and verify SDK evidence in the upload, instead of guessing at minified bundle markers and asset paths.

The manifest is an **attestation that points at evidence**. It does not replace bundle-level scanning. It makes scanning targeted, robust to bundler quirks, and produces clear failure modes for developers.

This covers both supported browser SDK surfaces:

- rPPG apps using `@elata-biosciences/rppg-web`
- EEG apps using `@elata-biosciences/eeg-web` and `@elata-biosciences/eeg-web-ble`

## Problem

The App Store currently checks built output to decide whether an uploaded app actually uses the Elata SDK. That is fragile because:

- bundlers mangle function and class names, and split chunks unpredictably
- Vite absolute asset paths can resolve to the blob origin root instead of the uploaded release directory
- package imports can be tree-shaken or hidden behind generated code
- EEG and rPPG have different runtime surfaces
- SDK internals such as wasm filenames are implementation details, not a stable contract

Recent Hyperbia scans showed the failure modes clearly:

- Hyperbia used the EEG SDK through `initEegWasm`, `AthenaWasmDecoder`, and `BleTransport`
- the scanner originally only recognized rPPG markers
- after that was fixed, the scanner still missed the bundle when `/assets/...` resolved to the blob origin root instead of the uploaded release directory

The SDK should publish a first-class artifact the scanner can rely on. Bundle scanning then becomes corroboration of a claim, not exhaustive search.

## Trust model

The manifest is a developer attestation. Anyone can write JSON. The strength of the verification comes from binding the attestation to evidence the scanner can independently check.

Layered, in order of trust:

1. **Manifest** — declarative claim of which SDK packages and capabilities are present, plus pointers to evidence files in the upload.
2. **Evidence verification** — scanner fetches each referenced file, checks `sha256`, and checks for SDK anchor strings (see below). This binds the claim to real artifacts in the same upload.
3. **Capability cross-check** — scanner derives expected capabilities from declared packages and rejects mismatches (e.g. claiming `eeg` without `@elata-biosciences/eeg-web`).
4. **Bundle scan corroboration** — current static marker scanner runs as confirmation. Manifest + evidence + scan agreement is the high-confidence state.

A manifest **alone** is treated as a weak signal. A manifest with verified evidence and corroborating bundle scan is a strong signal. Bundle scan alone (no manifest) remains acceptable as legacy.

This is Phase 1 of three:

- **Phase 1 (this PR):** declarative manifest with hash-and-anchor evidence verification.
- **Phase 2:** rely on npm package provenance (sigstore attestations from `npm publish --provenance`) to verify the declared SDK packages were actually published by Elata.
- **Phase 3:** SDK-signed manifests if Phase 2 proves insufficient.

We avoid signing in Phase 1 deliberately — npm provenance is the correct long-term primitive and we do not want to ship a bespoke signing scheme that competes with it.

## Proposed manifest

```json
{
  "$schema": "https://schemas.elata.bio/elata-manifest/v1.json",
  "schemaVersion": 1,
  "generatedBy": {
    "name": "@elata-biosciences/create-elata-demo",
    "version": "0.0.0"
  },
  "generatedAt": "2026-05-07T00:00:00.000Z",
  "sdk": {
    "packages": [
      { "name": "@elata-biosciences/eeg-web", "version": "0.1.22" },
      { "name": "@elata-biosciences/eeg-web-ble", "version": "0.1.22" }
    ],
    "capabilities": ["eeg"]
  },
  "build": {
    "tool": "vite",
    "base": "./",
    "outputDir": "dist"
  },
  "provenance": {
    "repo": "https://github.com/example/example-app",
    "commit": "abcdef1234567890"
  },
  "evidence": {
    "files": [
      {
        "path": "assets/index-abc123.js",
        "sha256": "...",
        "anchors": ["ELATA_SDK_ANCHOR__eeg-web@0.1.22"]
      },
      {
        "path": "assets/eeg_wasm_bg-def456.wasm",
        "sha256": "...",
        "anchors": ["ELATA_SDK_ANCHOR__eeg-wasm@0.1.22"]
      }
    ]
  }
}
```

### Field rules

- `$schema` is the URL of the JSON Schema published by the SDK. Editors and the scanner validate strictly against it. Unknown fields are accepted and ignored to allow forward-compatible additions.
- `sdk.packages` is the source of truth for which SDK packages the app uses. The scanner derives capabilities from packages and rejects any `sdk.capabilities` value not implied by `packages`.
- `sdk.entrypoints` is **not** included. Symbol names are implementation details and re-introduce the brittleness this design is escaping.
- `evidence.files` is **required** and must be non-empty. Every declared capability must have at least one evidence file whose `anchors` include that capability's anchor (see below).
- `provenance` is optional. When present it should come from CI env vars (`GITHUB_REPOSITORY`, `GITHUB_SHA`, etc.). It is a cross-upload consistency hint, not a security claim.
- `generatedAt` is optional and may be omitted or pinned via `SOURCE_DATE_EPOCH` for reproducible builds.
- The manifest must not include user identifiers, wallet addresses, raw sensor data, absolute local paths, environment values, or secrets.

### SDK anchors

Each SDK package emits a stable, source-level anchor constant of the form `ELATA_SDK_ANCHOR__<package-short-name>@<version>` that survives minification because it is referenced from the public entry. The anchor is the SDK's responsibility to keep stable across patch releases.

Anchors solve a problem hashes do not: a single byte change in user code invalidates a file hash, but the SDK code (and its anchor) is still present. The scanner uses the hash as a tamper check on the as-built file and the anchor as a "real SDK code is in here" check that is robust to chunk-splitting and code mixing.

### Capability-to-anchor mapping (Phase 1)

| Capability | Required anchor prefix              |
| ---------- | ----------------------------------- |
| `rppg`     | `ELATA_SDK_ANCHOR__rppg-web@`       |
| `eeg`      | `ELATA_SDK_ANCHOR__eeg-web@` *or* `ELATA_SDK_ANCHOR__eeg-wasm@` |

Mapping is owned by the SDK and versioned with the schema.

## Validation algorithm

The App Store scanner runs, in order:

1. Fetch `elata-manifest.json` from the uploaded release root. If absent, fall through to legacy bundle-only scanning and mark the upload as `legacy-scan`.
2. Validate against the published JSON Schema. Reject on schema error.
3. For each declared `sdk.packages[]` entry, confirm the package is a known Elata package. Reject on unknown package.
4. Derive expected capabilities from declared packages. Reject if `sdk.capabilities` contains anything not implied.
5. For each capability, require at least one `evidence.files[]` entry whose `anchors[]` includes the matching anchor prefix. Reject if missing.
6. For each `evidence.files[]` entry: fetch the file from the upload, verify `sha256`, verify each declared anchor appears in the file bytes. Reject on hash mismatch or missing anchor.
7. Run the existing static bundle marker scanner as corroboration. Disagreement (manifest claims a capability the bundle scan finds no trace of) is logged and surfaced in the admin UI but does not auto-reject in Phase 1.
8. Mark upload `manifest-verified` on success.

Uploads without a manifest are accepted as `legacy-scan` until the rollout window closes (see Rollout plan).

## SDK-side implementation (Phase 1 scope)

For v1, ship one delivery path only — a postbuild step in the `create-elata-demo` templates. Defer the reusable Vite plugin until a second consumer exists.

Concretely:

- A small generator module in `packages/create-elata-demo` (or a shared internal helper) that reads the template's `package.json`, finds Elata SDK deps, walks the build output, computes hashes, locates anchors, and writes `dist/elata-manifest.json`.
- Each SDK package (`rppg-web`, `eeg-web`, `eeg-web-ble`, `eeg-wasm`) adds its anchor constant to its public entry.
- Each scaffold template (`rppg-demo`, `ppg-demo`, `eeg-demo`, `eeg-ble`) wires the postbuild step into its `build` script.
- Publish the JSON Schema as a static asset and reference it from the manifest.

Existing apps adopt the manifest by adding the postbuild step. A reusable Vite plugin can be extracted later once the postbuild script's shape is proven.

## Out of scope for this PR

- **Vite `base: './'` template fix.** The Hyperbia blob path bug is real but independent of the manifest. It should land as a separate template fix immediately so legacy bundle scanning works correctly even without the manifest.
- **Vite plugin extraction.** Defer until two consumers exist.
- **Signed manifests.** Phase 3.
- **App Store changes.** Tracked as a follow-up in `elata-appstore` (see below).

## Acceptance criteria

- `create-elata-demo` generated apps for all current templates produce `dist/elata-manifest.json`.
- Each shipped SDK package exports its anchor constant from its public entry, and the constant survives a production Vite build.
- Manifest validates against the published JSON Schema.
- Manifest never includes secrets, absolute local filesystem paths, wallet addresses, user IDs, or sensor data.
- Manifest is byte-identical across two consecutive builds when `SOURCE_DATE_EPOCH` is set or `generatedAt` is omitted.
- Tests cover rPPG-only, EEG-only, mixed capability, and no-SDK cases, plus the negative case where unrelated packages do not generate Elata SDK capability claims.
- Docs explain how an existing Vite app adopts the manifest.

## Suggested tests

- **Unit:** package detection from representative `package.json` files.
- **Unit:** capability derivation from packages, including rejection of mismatched declared capabilities.
- **Unit:** anchor presence check (positive, missing, partial).
- **Unit:** schema validation (valid, missing required field, unknown package, hash mismatch).
- **Integration:** scaffold each template, run `pnpm build`, assert `dist/elata-manifest.json` exists, validates, references real files, and references match anchors are found inside those files.
- **Integration:** reproducibility — build the same template twice with `SOURCE_DATE_EPOCH` pinned and assert byte-identical manifests.
- **Negative:** unrelated app (no Elata deps) does not produce Elata SDK capability claims; ideally produces no manifest, or an empty-capabilities manifest if generated unconditionally.

## App Store follow-up (separate PR in `elata-appstore`)

- Fetch `elata-manifest.json` alongside `index.html`.
- Validate using the published JSON Schema.
- Implement the validation algorithm above.
- Surface manifest validation state, capability cross-check, and bundle-scan agreement in the admin scan UI.
- Keep static marker scanner as corroboration and as legacy fallback for older uploads.

## Rollout plan

1. Land SDK manifest generator, anchor constants, JSON Schema, and template wiring.
2. Publish SDK and tooling versions.
3. Update `elata-appstore` scanner to read and verify the manifest.
4. Accept manifest-less uploads as `legacy-scan` for at least one full template propagation cycle.
5. Once the majority of new uploads carry a manifest, graduate manifest absence from a soft warning to a release-check requirement.
6. Plan Phase 2 (npm package provenance verification) once tooling is in place.

## Risks and open questions

- A hand-written manifest can pass evidence checks if the attacker pastes real SDK chunks into their bundle. Phase 1 raises the bar without claiming to close it; npm provenance (Phase 2) is the real fix.
- Anchor constants must survive aggressive minifiers and tree-shakers across multiple bundlers. This needs a CI test on at least Vite (Rollup) and Webpack, and the SDK publish pipeline should fail if the anchor is missing from its own dist build.
- Should the generator be in `create-elata-demo` only, or a standalone `@elata-biosciences/manifest` package from day one? Recommendation: keep it in `create-elata-demo` until extraction is justified.
- Should `provenance.commit` ever be required? Recommendation: no, optional indefinitely. It is a hint, not a security claim.
- Should bundle-scan / manifest disagreement be a hard reject? Recommendation: warn-only in Phase 1, revisit after observing real upload data.

## Validation for this docs PR

Docs-only draft. No code validation required beyond markdown review.
