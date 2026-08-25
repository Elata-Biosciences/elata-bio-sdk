# Reconciling the two biosignal-session implementations

Status: in progress. Owner: Kyle. Reviewer: Carter.

## What happened

Carter and Kyle independently implemented `@elata-biosciences/biosignal-session`
without knowing the other was doing it. Carter's landed on `main` on 2026-08-23
(3 commits, `e269235`); Kyle's is on `feat/long-local-analytics` (32 commits).
Both are version `0.1.0`. Neither is published to npm — the registry has no
`biosignal-session` at all — and nothing in either repository imports Carter's
yet, so no downstream consumer breaks either way.

No process failed. Two people solved the same brief in parallel.

## Where the two already agree

This is worth stating first, because it is the strongest evidence both designs
are sound. Written separately, they converged on: the
Session → Source → Stream → Chunk → Event hierarchy; session-relative microsecond
offsets; Apache Arrow columnar chunks; a `MessageChannel` handshake with a
transferred port; per-chunk integrity hashing; idempotent replay;
interrupted-session recovery; per-stream backpressure; scoped local-first
storage; and no network on the raw path.

The two error vocabularies were written independently and share ten codes
verbatim — `checksum_mismatch`, `sequence_conflict`, `payload_too_large`,
`quota_exceeded`, `scope_denied`, `handshake_timeout`, `not_supported`,
`disposed`, `transport`, `internal` — out of nineteen each.

## Where they cannot be reconciled

Seven decisions, each made once, each made differently.

| Decision | Kyle's | Carter's |
| --- | --- | --- |
| Handshake token | `__elata_biosignal_init` | `elata.biosignal-session.connect/v1` |
| Arrow container | IPC **file** per chunk | IPC **stream** |
| Chunk integrity | CRC32C | SHA-256 + schema hash |
| Stream schemas | 5 fixed Arrow schemas | self-describing field list |
| Protocol ops | 13, incl. read/list/delete/quota | 8, record-only |
| Storage lives in | the consuming host | the SDK package |
| Session identity | catalog rows | one manifest document |

The Arrow row is the deepest. A file-per-chunk is independently decodable, so a
single chunk survives without its neighbours; a stream is cheaper to append but
assumes its predecessors. Recovery, partial reads and per-chunk verification all
follow from that choice.

## Decision

**Kyle's implementation is the base. Three separable pieces of Carter's are
ported onto it.**

The decision rests on what is furthest along rather than on design merit: 352
tests against 9, two-phase commit with recovery and multi-tab writer election,
device adapters, and a Rust/WASM analytics engine already built against this
protocol in a 37-commit App Store branch (Elata-Biosciences/elata-appstore#539).

Carter's design is better in the places listed below, and those are being taken.

### Being ported

1. **Portable session archives.** A ZIP of manifest, NDJSON events, Arrow chunks
   and a SHA-256 index. Import verifies every checksum before writing anything
   and rolls the session back on failure. Kyle's has no export at all.
2. **The consent model.** `recording` / `portableExport` /
   `federatedContribution`, with `recording: "granted"` as a single-value literal
   so the type system permits no un-consented session. Kyle's has no consent
   concept anywhere, in either repository — a real omission given Elata's
   federated-learning direction.
3. **Generic model provenance.** `modelId`, `modelVersion`, `modelSha256`,
   `featureSchemaId`, `featureSchemaVersion`. Kyle's provenance is a
   discriminated union that is richer for EEG specifically but carries no generic
   model hooks. Both are kept; they answer different questions.

Also taken: the broader modality vocabulary (`ecg`, `eda`, `fnirs`), and
`docs/architecture-biosignal-session-v1.md` unchanged, as the starting point for
a shared format spec.

### Deliberately not adopted, and why

- **Storage in the SDK.** The package stays headless: it defines contracts and
  the wire, the host owns durability. Carter's `SessionStore` is a storage-engine
  contract; implementing it over the App Store catalog would create a second
  write path that can diverge from the existing two-phase commit.
- **SHA-256 on chunk descriptors.** `checksumOf()` is synchronous by design;
  `crypto.subtle.digest` is not. Adding it would put an `await` in the recording
  hot path and force an IndexedDB migration of every stored session. SHA-256 is
  used at the archive boundary only, where third-party verifiability is the
  point. The two guard different threat models: CRC32C guards storage corruption
  for bytes that never leave the device, SHA-256 guards transport for bytes that
  do.
- **Arrow IPC stream.** See above — independent decodability is load-bearing for
  recovery.

## Changes to Carter's design being made in the port

- **The consent gate is enforced.** `exportSessionArchive` calls
  `validateManifest` but never checks `consent.portableExport`, so an export
  succeeds even when consent is `denied`. The port throws `scope_denied` before
  the first payload read. A consent field that nothing enforces is worse than no
  consent field, because it implies a guarantee the code does not keep.
- **Verify-before-write becomes a type-system property.** In Carter's version the
  ordering is a convention held by statement order inside one function. In the
  port, the only way to obtain a payload is through a `ParsedSessionArchive`, and
  that object cannot exist unless every checksum passed.
- **`clock-observations.ndjson` is added.** Kyle's records clock alignment
  observations and Carter's has no analogue, so the archive would otherwise
  silently drop real data.
- **Chunk payloads are stored, not deflated.** Arrow float32 is near
  incompressible; a global `level: 6` burns CPU for single-digit percent. JSON and
  NDJSON entries still deflate.
- **`formatVersion: 2`.** The field names differ at every level, so archives were
  never going to interchange. Carter's validator fails closed on
  `formatVersion !== 1`, so bumping buys a clean rejection rather than a
  mis-parse. The `elata.biosignal-session` format id is kept.

## Container layout

Kept byte-identical to Carter's, because this is the part that genuinely
interoperates:

```
manifest.json
events.ndjson
clock-observations.ndjson      (added)
summary.json
chunks/<encodeURIComponent(streamId)>/<sequence padded to 10>.arrow
checksums.sha256
```

`checksums.sha256` is `<64 lowercase hex>` + two spaces + path, sorted, trailing
newline, excluding itself and including `manifest.json`. That file verifies with
coreutils `sha256sum -c` and no Elata code.

**It is integrity, not authenticity.** Anyone who can modify the archive can
recompute both digests. A detached `signature.json` is the extension point and is
explicitly out of scope. No UI string should imply provenance.

## Work remaining

1. Contracts: `consent.ts`, `ModelProvenanceV1`, the modality additions, and
   `consent` on `SessionCreateSpec`.
2. `src/archive/`: source port, manifest, paths, sha256, checksum index, zip
   boundary, export, parse.
3. Packaging: `fflate` dependency behind a new `./archive` subpath — which means
   three edits, not one (`exports`, `verify:build`, and the hardcoded `entries`
   array in `scripts/verify-dist-esm.mjs`), plus `dist/archive.js` in
   `validate-tarballs.mjs`.
4. `jest.setup.cjs` must gain a `webcrypto` polyfill first: jsdom 20 ships
   `crypto.getRandomValues` but not `crypto.subtle`, so every SHA-256 test fails
   until it does. Note also that the existing `structuredClone` polyfill there is
   a JSON round-trip and therefore destroys `Uint8Array` — archive code must
   never call it.
5. App Store follow-up: the source adapter over `BiosignalCatalog`, an importer
   modelled on the existing `legacy/import-session-report.ts`, consent on
   `SessionRow`, the paired `biosignal-protocol-v1.json` fixture bump, and a
   download path.

## Open questions for Carter

These are genuine. Several of the choices above may have reasons that were not
considered.

1. **Why Arrow IPC stream rather than file?** If it was for append cost, that
   trade is worth making explicitly — independent decodability was the reason for
   the other choice.
2. **Is storage belonging to the SDK deliberate?** It makes the package usable
   standalone, which is a real benefit. The answer decides the package boundary.
3. **Was tamper-evidence a requirement behind SHA-256 on chunks?** If archives
   are meant to be verifiable by a third party, that is the right call and the
   chunk-level decision here should change.
4. **What drove the consent model, especially `federatedContribution`?** If there
   is a product or legal driver, it should shape how the gate behaves rather than
   the other way round.
5. **Is `scopeId` intended to be the wallet address?** Storage here is
   wallet-scoped, which is what makes per-account deletion and multi-account
   isolation work on a shared machine.
