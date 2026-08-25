# Elata Biosignal Session v1

Status: Implemented as a provisional Session v1 vertical slice (2026-08-23)

## Decision summary

Elata will define one modality-neutral logical session format for browser capture,
local recovery, replay, analysis, and portable export.

The proposed format is **Elata Biosignal Session v1**:

- a versioned JSON manifest defines the session, sources, streams, clocks,
  provenance, consent state, model versions, and chunk inventory;
- dense biosignal and metric streams use independently decodable Arrow IPC
  streaming chunks;
- sparse reference measurements, stimuli, annotations, and lifecycle events use
  JSON/NDJSON;
- a finalized portable session exports as a ZIP-compatible `.elata` bundle;
- IndexedDB owns the authoritative commit catalog and recovery state; OPFS
  stores immutable Arrow payloads when available, with an IndexedDB binary
  fallback behind the same adapter.

Arrow IPC is an encoding inside the standard. It is not, by itself, the session
standard. IndexedDB and OPFS are persistence implementations and are not the
portable interchange format.

The implementation is intentionally provisional until Kyle confirms the
remaining product-policy and browser-support decisions. Its contracts are now
concrete enough to test and iterate rather than continuing as an abstract DB
discussion.

## Goals

- Record EEG, hardware PPG, camera rPPG, derived metrics, and later modalities
  under one session without forcing them into one table or sample rate.
- Keep raw and derived data local by default.
- Allow a sandboxed app to stream bounded data to a trusted host without sending
  one large file through `postMessage`.
- Recover acknowledged chunks after a page crash or incomplete finalization.
- Export a self-describing session that TypeScript, Python, and Rust tooling can
  validate and read.
- Preserve enough provenance to reproduce derived metrics and determine which
  SDK, feature schema, and model artifact produced them.
- Permit future import/export adapters without introducing multiple canonical
  internal formats.

## Non-goals for v1

- A general-purpose database or browser SQL layer.
- SQLite/WASM use or assuming OPFS exists in every supported browser.
- Raw camera-video recording by default.
- One universal schema containing every possible biosignal field.
- A dashboard query API, federated-learning protocol, or server-sync protocol.
- A clinical data standard or a claim of compatibility with every NWB/EDF use
  case.
- Automatic upload of raw signals, events, or exported `.elata` bundles.

## Logical model

### Session

A session is the lifecycle and clock boundary for one recording. It contains
sources, streams, sparse events, derived summaries, and the exact processing
artifacts used during capture.

### Source

A source is one physical or logical producer, for example:

- an Athena or Muse headset;
- a camera-backed rPPG session;
- a standalone pulse sensor;
- a synthetic or replay source.

A source may expose several streams. One headset can therefore produce EEG,
optical PPG, accelerometer, and battery streams without making the session
headset-specific.

### Stream

A stream is one independently typed, sampled, and versioned sequence. Streams
must declare at least:

- `streamId` and `sourceId`;
- modality and stream schema version;
- channel names, physical units, and numeric representation;
- nominal sample rate when regular;
- clock source and timestamp policy;
- raw, processed, or derived status;
- processing/model provenance when derived;
- ordered chunk references and integrity hashes.

Different modalities remain separate streams even when they originate from the
same source. A mixed EEG+rPPG session is represented as several streams under
one session, not one wide table with many nullable columns.

### Chunk

A chunk is an immutable, ordered payload for exactly one stream and schema. It
has a sequence number, time range, sample count, encoding, byte length, and
checksum. Acknowledged chunks are never mutated in place.

### Event

An event is sparse, timestamped session information such as:

- reference BPM or a paired measurement;
- a game stimulus or application action;
- an annotation;
- calibration start/end;
- a lifecycle or quality incident.

Events may have type-specific payloads, but the common envelope must remain
versioned and bounded.

### Summary

A summary contains finalized derived values for dashboards or discovery. Every
metric must identify its definition/version, units, input time range,
algorithm/model provenance, confidence, quality/coverage, and exclusion reason
where applicable. A summary is reproducible derived data, not a substitute for
the underlying stream.

## Proposed portable layout

```text
session.elata
|-- manifest.json
|-- chunks/
|   |-- eeg-athena/
|   |   |-- 000001.arrow
|   |   `-- 000002.arrow
|   |-- ppg-athena/
|   |   `-- 000001.arrow
|   |-- rppg-camera/
|   |   `-- 000001.arrow
|   `-- rppg-metrics/
|       `-- 000001.arrow
|-- events.ndjson
|-- summary.json
`-- checksums.sha256
```

The `.elata` suffix identifies the Elata container, not a fork of Arrow. ZIP is
the v1 packaging mechanism because it is portable across browser and research
tooling. The current `Uint8Array` export helper buffers the finalized archive;
a streaming file sink and any guaranteed compression profile remain deferred
until large-session benchmarks establish the right API.

## Manifest sketch

The manifest shape below is illustrative. The vertical slice must turn it into
a validated schema and golden fixture before the public API is frozen.

```json
{
  "format": "elata.biosignal-session",
  "formatVersion": 1,
  "sessionId": "session:018f-example-uuid",
  "status": "complete",
  "startedAt": "2026-08-03T16:20:01.120Z",
  "durationUs": 180000000,
  "clock": {
    "timeUnit": "microsecond",
    "wallClockStartIso": "2026-08-03T16:20:01.120Z"
  },
  "app": { "appId": "example-app" },
  "sources": [],
  "streams": [],
  "models": [],
  "consent": {
    "recording": "granted",
    "portableExport": "not_requested",
    "federatedContribution": "not_requested"
  },
  "extensions": {}
}
```

Direct identity such as a wallet address should not be embedded in a portable
session by default. The host may use identity to scope local database access,
while the exported manifest uses a pseudonymous or omitted subject identifier
unless an explicitly consented workflow requires otherwise.

## Dense stream encoding

### Arrow IPC variant

Use Arrow IPC **streaming** encoding for live chunks. Each stored chunk should
be independently decodable and include its Arrow schema rather than depending
on a prior in-memory writer. This repeats a small amount of schema metadata but
improves recovery, validation, transport, and migration.

Do not use one open-ended Arrow file as the live crash-recovery boundary. A
random-access Arrow file requires correct finalization/footer metadata and is
better suited to optional compaction after the session is complete.

### Regularly sampled signals

For regular EEG or hardware PPG, store typed channel columns and put the common
timing information in the chunk descriptor:

```text
Arrow columns:
  TP9:  float32
  AF7:  float32
  AF8:  float32
  TP10: float32

Chunk descriptor:
  startOffsetUs: 120000000
  sampleRateHz: 256
  sampleCount: 2560
```

Do not write a repeated timestamp column when sample timing can be derived
without ambiguity. For irregular sampling, dropped samples, or source-provided
timestamps, add an explicit integer offset/timestamp column and document its
clock domain.

Do not force every stream to `float32`. Preserve useful raw sensor values as
`int16`/`int32` with scale and offset metadata where applicable, and expose
processed physical-unit values as a distinct stream when both are retained.

### Derived streams

Camera waveform, estimator metrics, final BPM, signal quality, and model output
are separate streams when their cadence or schema differs. A metrics record may
refer to a time range in a waveform stream; it must not repeat a full sliding
waveform window on every row.

This is especially important for adapting the current unversioned
`RppgSessionRecorder` replay shape, which can contain repeated waveform windows.
The existing replay object remains supported through an adapter rather than
becoming the universal session contract.

## Sparse events and summaries

Sparse events use one JSON object per line in `events.ndjson`:

```json
{"offsetUs":15802000,"type":"reference_bpm","schemaVersion":1,"data":{"value":72,"unit":"bpm","source":"muse-ppg","uncertaintyMs":250}}
{"offsetUs":30000000,"type":"game_stimulus","schemaVersion":1,"data":{"name":"round_started","level":3}}
```

The common event envelope must be validated. Event-specific `data` is bounded
and versioned by type. Binary payloads or long arrays belong in referenced
attachments/streams, not inline event JSON.

`summary.json` is written or replaced only when a session is finalized or
recomputed with an explicitly recorded summary-definition version.

## Browser persistence

### IndexedDB responsibility

The implementation uses IndexedDB for:

- session manifests and lifecycle state;
- source and stream declarations;
- immutable chunk commit records and, when OPFS is unavailable, binary chunks;
- sparse events and summaries;
- indexes used by session lists and dashboards;
- finalization, recovery, and deletion state.

This is a new biosignal-session storage surface. It must not store raw sessions
through `app-metrics`, whose quotas and record semantics are designed for small
app metrics.

### OPFS responsibility

`OpfsChunkPayloadStore` stores the immutable Arrow bytes while IndexedDB retains
the manifest, descriptor/checksum inventory, events, summary, and indexes. The
same `SessionStore` contract falls back to IndexedDB payload records where OPFS
is unavailable. A chunk is acknowledged only after both the payload write and
catalog commit; a failed catalog commit removes the just-written payload.

Browser persistence remains quota-managed and user-clearable. The host must
surface quota errors, request persistent storage where appropriate, and provide
explicit export and deletion operations. Local persistence is not a backup.

## Sandboxed app/host protocol

The App Store host owns storage and validation. A sandboxed app sends bounded
session operations over a transferred `MessagePort`:

```text
session.begin
stream.declare
chunk.write -> chunk.ack
event.write -> event.ack
session.finalize -> session.finalized
session.abort
```

Binary chunk payloads are transferred as `ArrayBuffer`s rather than serialized
as JSON or copied as a complete session file. Every request carries a protocol
version, request ID, session ID, and operation-specific sequence/idempotency
key.

Provisional transport bounds for the vertical slice:

- prefer chunks around 64-256 KiB;
- reject any single chunk above 1 MiB;
- allow at most two unacknowledged chunks per stream;
- acknowledge only after validation and durable local commit;
- retrying the same `(sessionId, streamId, sequence)` must be idempotent;
- conflicting bytes for an acknowledged sequence must be rejected.

These are protocol safeguards, not final performance tuning. The vertical slice
must measure them in supported browsers before v1 is accepted.

## Proposed package boundary

Create one platform-neutral package provisionally named:

```text
@elata-biosciences/biosignal-session
```

Candidate responsibilities:

- manifest, source, stream, chunk, event, and summary contracts;
- runtime validation and compatibility checks;
- Arrow encoder/decoder;
- in-memory storage adapter for tests;
- finalized `.elata` import/export;
- adapters from current EEG/headband and rPPG recording surfaces.

Candidate entry points, to be confirmed during review:

```text
@elata-biosciences/biosignal-session
@elata-biosciences/biosignal-session/arrow
@elata-biosciences/biosignal-session/host
```

The review must decide whether App Store-specific `MessagePort` and IndexedDB
code belongs under `/host` or in a separate App Store bridge package. The core
contracts must not import DOM storage APIs so they remain usable in Node, Rust
interop tooling, and native-facing workflows.

A provisional consumer API might be:

```ts
const session = await recorder.createSession(metadata);
await session.declareStream(stream);
await session.appendBlock(streamId, block);
await session.recordEvent(event);
await session.finalize();
```

This is an interaction sketch, not a frozen public API.

## Compatibility and versioning

- Version the container, each stream schema, each event type, and each derived
  metric definition independently.
- Permit additive optional manifest fields within v1.
- Reject, preserve, or explicitly degrade on unknown required schemas; never
  silently reinterpret a field.
- A stream cannot change channel layout, units, numeric representation, or
  timestamp meaning in place. Declare a successor stream/schema instead.
- Preserve unknown extension metadata during lossless import/export where
  practical.
- Keep migrations explicit and tested against golden fixtures.
- Record model and feature-schema IDs/hashes as provenance; do not bundle model
  weights into every session by default.

## Future-scenario checks

| Scenario | Expected v1 handling |
| --- | --- |
| EEG and rPPG together | Separate streams under one session and an explicit clock/alignment model. |
| New ECG, EDA, fNIRS, or IMU source | Add a source, modality, and stream schema without changing the container. |
| Different sample rates | Keep independent stream cadence and chunk boundaries. |
| Irregular or dropped samples | Add explicit offsets/timestamps and quality/drop metadata. |
| Device clock drift | Record clock domain plus offset/drift/alignment provenance and uncertainty. |
| New derived metric | Add a versioned derived stream or summary definition. |
| Schema changes during capture | Close the old stream and declare a successor; do not mutate acknowledged chunks. |
| Large recording | Use OPFS payload storage without changing session semantics; benchmark thresholds and export memory separately. |
| Browser crash | Recover acknowledged chunks and mark the session interrupted/recoverable. |
| Research archive | Convert the canonical session to NWB, EDF/BDF, or Parquet through an adapter. |
| Video or another large opaque asset | Store a referenced attachment with media type and hash; do not force it into an Arrow table. |
| Future binary encoding | Add a declared encoding through a format migration or extension; do not accept arbitrary per-app encodings in v1. |

## Implementation ownership

The proposed collaboration split from the planning meeting is:

| Area | Proposed owner |
| --- | --- |
| Session schema, manifest types, Arrow encoding, import/export, EEG/rPPG adapters | Carter |
| Iframe protocol, host-side persistence, IndexedDB adapter, acknowledgement/backpressure | Kyle |
| Public API, package boundary, consent semantics, versioning, acceptance fixtures | Joint review |

Ownership does not create independent designs. Both sides implement against the
same manifest, chunk descriptor, error model, and golden fixtures.

## First vertical slice

The initial package now implements this deliberately narrow proof:

1. Start a synthetic session.
2. Declare one four-channel EEG stream and one rPPG-metrics stream.
3. Encode several immutable Arrow IPC stream chunks.
4. Transfer them through a real `MessageChannel` using transferable buffers.
5. Persist them in IndexedDB through the host adapter.
6. Interrupt before finalization and verify recovery of acknowledged chunks.
7. Resume or finalize without duplicating sequences.
8. Export a `.elata` bundle and import it in a clean database.
9. Verify samples, timestamps, schemas, event ordering, and checksums exactly.
10. Read the exported Arrow streams in Python and compare them with the source
    fixture.

Then repeat with a bounded real recording using current `HeadbandFrameV1` and
`RppgSessionRecorder` adapters.

### Acceptance gates

- TypeScript export/import round-trip is lossless for the defined fixture.
- Python reads the same Arrow values, nulls, channel order, and sample counts.
- Unknown or incompatible schema versions fail with typed errors.
- A killed/incomplete session exposes only acknowledged chunks and is visibly
  marked interrupted rather than complete.
- Duplicate retries are harmless; conflicting duplicates are rejected.
- No protocol message exceeds the configured maximum.
- Peak browser memory is bounded by the in-flight chunk limit, not total session
  duration.
- Deleting a session removes its manifest, events, summaries, and all chunk
  payloads.

## Implementation sequence

1. Review this decision and resolve the blocking questions below.
2. Add validated TypeScript contracts and golden fixtures.
3. Implement the in-memory adapter and Arrow chunk codec.
4. Implement the MessageChannel protocol and IndexedDB adapter.
5. Pass the mixed EEG/rPPG vertical slice and recovery gates.
6. Add current EEG and rPPG adapters without breaking existing public APIs.
7. Finalize package entry points, README, changeset, and release verification.
8. Build dashboards and federated workflows against finalized sessions rather
   than against legacy debug JSON.

## Blocking review questions

These must be resolved before marking this document Accepted:

1. Does the App Store host bridge live under a package `/host` entry point or in
   a separate package?
2. Is session time represented as integer microseconds from one session origin,
   and what exact metadata describes device-clock alignment and uncertainty?
3. **Provisional implementation decision:** IndexedDB is authoritative; OPFS is
   the preferred payload store, with an IndexedDB fallback. Browser benchmarks
   still determine thresholds and the final support matrix.
4. Which consent fields are required in the portable manifest, and which
   identity fields must always remain outside it?
5. Which compression profile, if any, is guaranteed by v1 readers? The first
   implementation should prefer interoperability over an untested codec choice.
6. What package name and initial public entry points will be released?

## Deferred decisions

- Secure server synchronization and remote backup.
- Federated-training job and update envelopes.
- Dashboard index/materialized-view design.
- OPFS thresholds, browser support policy, and compaction.
- At-rest encryption and managed key recovery.
- Parquet, NWB, EDF/BDF, and legacy TradeLock export adapters.
- Long-term attachment handling for video or other large media.
