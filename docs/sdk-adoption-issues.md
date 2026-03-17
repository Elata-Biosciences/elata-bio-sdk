# SDK Adoption Issue List

Date: 2026-03-17

This issue list groups the remaining SDK adoption work by the friction it
creates for external developers.

## Onboarding

- Add screenshots or short GIF references for each scaffold template so users can confirm they picked the right starting point before investing setup time.
- Add dedicated consumer guides for:
  - EEG in a browser app
  - Web Bluetooth with supported devices
  - rPPG in a browser app
- Add a single compatibility matrix that covers browsers, Web Bluetooth support, Safari and iOS behavior, supported device classes, Node expectations, and package manager caveats.
- Consider a scaffolded-app `doctor` or `preflight` command if support keeps clustering around browser permissions, missing secure context, or workspace install mistakes.

## Package Docs

- Add advanced or custom-integration examples for `eeg-web`, `eeg-web-ble`, and `rppg-web`.
- Publish a lightweight API reference or export summary for each public package.
- Clarify the difference between package runtime expectations and repo maintainer tooling requirements anywhere Node versions are discussed.
- Keep preferred paths distinct from compatibility or legacy paths in examples and export docs.

## Runtime UX

- Audit user-facing errors in scaffolded apps, `eeg-web-ble`, `rppg-web`, and WASM-loading paths.
- Replace vague failures with actionable guidance for unsupported browsers, missing secure context, missing BLE support, missing packaged WASM assets, and camera-permission failures.
- Standardize the wording of recovery guidance so developers see the same next step in docs, examples, and runtime output.

## Release UX

- Add public API review to release verification so package exports, docs coverage, and migration notes are checked before publish.
- Publish a semver and stability policy that distinguishes stable APIs, compatibility layers, and experimental surfaces.
- Add a migration-note format for releases that change public developer behavior.

## Tracking Notes

- [implementation-plan-sdk-adoption.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/implementation-plan-sdk-adoption.md) remains the ordered execution plan.
- [sdk-adoption-baseline.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/sdk-adoption-baseline.md) captures the current state these issues were derived from.
