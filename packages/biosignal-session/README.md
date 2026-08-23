# @elata-biosciences/biosignal-session

Local-first recording, recovery, and interchange for mixed biosignal sessions.
Session v1 keeps EEG, PPG/rPPG, IMU, quality, and derived metrics as independently
typed streams under one clock and lifecycle boundary.

## What is implemented

- validated Session v1 manifest, source, stream, chunk, event, summary, consent,
  and provenance contracts;
- independently decodable Arrow IPC stream chunks with SHA-256 descriptors;
- IndexedDB as the authoritative catalog and OPFS as the preferred immutable
  payload store (with an IndexedDB binary fallback);
- transferable `MessagePort` transport with a 1 MiB default ceiling, two
  in-flight chunks per stream, idempotent retries, and ACK after durable commit;
- crash recovery that marks unfinished recordings `interrupted`, plus an
  explicit scoped resume operation that continues at the next sequence;
- checksummed ZIP-compatible `.elata` export/import;
- structural adapters for `HeadbandFrameV1` and rPPG `ReplayDebugSession` data.

## Record directly in the trusted host

```ts
import {
  BiosignalSessionRecorder,
  IndexedDbSessionStore,
  OpfsChunkPayloadStore,
  encodeArrowChunk,
} from "@elata-biosciences/biosignal-session";

const store = new IndexedDbSessionStore({
  payloadStore: new OpfsChunkPayloadStore(),
});
const recorder = await BiosignalSessionRecorder.begin({
  store,
  scopeId: "app:example", // host-local; not placed in portable exports
  appId: "example-app",
  input: {
    sources: [{ sourceId: "synthetic", name: "Synthetic EEG", kind: "synthetic" }],
  },
});

const stream = {
  streamId: "eeg.raw",
  sourceId: "synthetic",
  name: "Raw EEG",
  modality: "eeg",
  kind: "raw",
  schemaVersion: "example.eeg/v1",
  timing: { kind: "regular", sampleRateHz: 256, clockSource: "local" },
  fields: [{ name: "fp1", valueType: "float32", unit: "uV" }],
} as const;

await recorder.addStream(stream);
await recorder.writeChunk(await encodeArrowChunk(
  stream,
  { columns: { fp1: new Float32Array([1, 2, 3]) } },
  { sessionId: recorder.sessionId, sequence: 0, startOffsetUs: 0 },
));
await recorder.finalize();
```

## Sandboxed apps

The trusted host calls `installSessionWindowHost` (or `bindSessionHost` when it
already owns a `MessagePort`) and derives `scopeId`/`appId` from its own app
registry. The embedded app calls `connectSessionClient`. Never trust a scope or
identity supplied by the iframe itself.

The host serializes operations per port. A chunk ACK means its descriptor is in
the IndexedDB commit catalog and its bytes are durable in the configured payload
store. Retrying identical `(sessionId, streamId, sequence)` content is harmless;
different content at that key fails with `sequence_conflict`.

## Portable archive

`exportSessionArchive` returns ZIP bytes conventionally saved with an `.elata`
suffix. The archive contains:

```text
manifest.json
chunks/<encoded-stream-id>/<sequence>.arrow
events.ndjson
summary.json                 # when present
checksums.sha256
```

`importSessionArchive` verifies every indexed file before committing anything.
Identity used to scope local storage remains outside the portable manifest.
The current archive helper returns one `Uint8Array`, so large-session streaming
export to a file sink is still a deliberate follow-up rather than a hidden
memory guarantee.

## Deliberately deferred

Dashboard indexes, server synchronization, federated-learning job/update
envelopes, compression guarantees, at-rest encryption/key recovery, and
NWB/EDF/Parquet adapters are not Session v1 storage responsibilities yet.
