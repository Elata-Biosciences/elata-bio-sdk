# Recording biosignal sessions locally

`@elata-biosciences/biosignal-session` records a biosignal session to **local
device storage** and nothing else. It contains no network client and no remote
mirror: the app produces samples, a **trusted host** commits them, and the host
acknowledges a chunk only after that chunk is durably stored on the device.

Read this page when you are writing the **recording app** (the client). The
storage plane — OPFS payload files plus an IndexedDB catalog — belongs to the
host that embeds the app and is not shipped in this package.

## The model

```
Session ─┬─ Source (headset / camera / synthetic)
         └─ Stream (eeg, ppg, rppg-metrics, …)
              └─ Chunk (Arrow IPC file + CRC32C, sequence 0,1,2,…)
         └─ Event (markers, quality notes — never Arrow)
```

Canonical time is **session-relative integer microseconds** from a
`(Date.now(), performance.now())` pair captured once at session creation. Only
the thread that owns source callbacks assigns timestamps; workers have their own
`timeOrigin` and must never read a wall clock for data time.

## Entry points

| Import | Contents |
| ------ | -------- |
| `@elata-biosciences/biosignal-session` | DOM-free contracts, protocol types, error codes, time helpers, CRC32C |
| `@elata-biosciences/biosignal-session/browser` | `RecorderCore`, handshake, Arrow encode/decode, device adapters, worker launcher |
| `@elata-biosciences/biosignal-session/testing` | Deterministic PRNG, fake clock, synthetic source, in-memory host, recorder harness |

## Minimal recording flow

### 1. Anchor the clock

Capture the anchor once, on the thread that will timestamp samples.

```ts
import { captureClockAnchor, createSessionClock } from "@elata-biosciences/biosignal-session";

const anchor = captureClockAnchor();          // { startedAtUtcMs, startedAtMonotonicMs }
const clock = createSessionClock(anchor);     // clock.nowUs() → session µs
```

`toSessionUs(monotonicMs, anchor)`, `sampleTimeUs(timeUs0, offset, rateHz)` and
`samplePeriodUs(rateHz)` are available for derived per-sample times.

### 2. Get a port to the host

The host owns the channel. It creates a `MessageChannel`, keeps `port1`, and
transfers `port2` into the app frame:

```ts
// Host (trusted embedder)
import { postBiosignalInit } from "@elata-biosciences/biosignal-session/browser";

const { port1 } = postBiosignalInit((message, transfer) =>
  iframe.contentWindow!.postMessage(message, "*", transfer),
);
// all protocol traffic now flows over port1
```

```ts
// Client (the app)
import { captureBiosignalInitPort } from "@elata-biosciences/biosignal-session/browser";

const port = await captureBiosignalInitPort();  // resolves once, then stops listening
```

Trust lives in the captured port, not in the origin: the client accepts only the
first structurally valid init message, so a later forged init cannot steal the
channel. Without a valid init the promise rejects with `handshake_timeout`.

### 3. Start the engine

`RecorderCore` is a plain class with no worker APIs — it buffers samples, closes
chunks, encodes Arrow payloads, checksums them, and speaks the wire protocol
over the injected port. You own its clock tick.

```ts
import { RecorderCore } from "@elata-biosciences/biosignal-session/browser";
import type { ProtocolPort } from "@elata-biosciences/biosignal-session/browser";

const core = new RecorderCore({
  emit(message) {
    switch (message.t) {
      case "state":       /* idle → handshaking → ready → creating → recording … */ break;
      case "stream-open": /* message.clientStreamId → message.streamId (host id) */ break;
      case "progress":    /* committedChunks, committedBytes, bufferedBytes, inFlight */ break;
      case "error":       /* code, retryable, detail */ break;
      case "closed":      /* summary.totalChunks, summary.totalBytes, summary.endReason */ break;
    }
  },
});

const ticker = setInterval(() => core.tick(), 500);  // retries, backoff, heartbeat
core.handle({ t: "init", port: port as unknown as ProtocolPort });
```

The engine talks to a structural `ProtocolPort`
(`postMessage` / `onmessage` / `start` / `close`). A live `MessagePort`
satisfies it at runtime, but not under `strictFunctionTypes`: `ProtocolPort`'s
`onmessage` accepts `{ data: unknown }` while `MessagePort`'s requires a full
`MessageEvent`, and function-typed properties are compared contravariantly.
Hence the cast — or supply your own object implementing `ProtocolPort`.

To run the engine off the UI thread instead, `launchRecordingWorker()` returns a
module `Worker` running the same class; post it the identical messages
(`worker.postMessage({ t: "init", port }, [port])`) and read its emissions from
`worker.onmessage`. The worker shell ticks itself.

Engine tunables are optional and default to `BIOSIGNAL_LIMITS`:
`{ inFlightWindow, chunkTargetBytes, chunkMaxDurationUs, softBufferBytes, hardBufferBytes, ackTimeoutMs, heartbeatIntervalMs }`.

### 4. Create the session and open a stream

```ts
core.handle({
  t: "session/start",
  spec: {
    label: "morning-baseline",
    startedAtUtcMs: anchor.startedAtUtcMs,
    startedAtMonotonicMs: anchor.startedAtMonotonicMs,
    sources: [
      {
        kind: "wearable",
        name: "headband",
        adapter: "headband-transport@1",
        sdkPackages: [{ name: "@elata-biosciences/eeg-web-ble", version: "0.12.0" }],
      },
    ],
    provenance: {
      recorderVersion: "0.1.0",
      protocolVersion: 1,
      sdkPackages: [],
    },
  },
});

core.handle({
  t: "stream/open",
  clientStreamId: "eeg",           // your id; the host assigns its own
  draft: {
    sourceId: "headband",          // the source's `name`, by convention
    modality: "eeg",
    sampling: "regular",
    sampleRateHz: 256,
    channels: [
      { name: "TP9", unit: "uV" },
      { name: "AF7", unit: "uV" },
      { name: "AF8", unit: "uV" },
      { name: "TP10", unit: "uV" },
    ],
    encoding: "arrow-ipc",
    arrowSchemaId: "regular-wide-f32@1",
    layout: "wide",
    clockSource: "local",
  },
});
```

Streams may be opened before the session id exists — the engine defers the
`stream/open` and any chunks closed in the meantime until the host replies.

### 5. Push samples

Regular streams take **row-major** `Float32Array` batches
(`samples[row * channelCount + channel]`) plus the absolute sample index and
session time of the first row. No per-sample time column is stored: time is
reconstructed from `sampleIndexStart` and the descriptor's rate, and real gaps
are recorded as explicit discontinuities rather than fabricated timestamps.

```ts
let sampleIndex = 0;

function onFrame(rowMajor: Float32Array, rows: number) {
  core.handle({
    t: "samples",
    clientStreamId: "eeg",
    sampleIndex0: sampleIndex,
    timeUs0: clock.nowUs(),
    rows,
    channels: 4,
    // Must be an exact-fit ArrayBuffer — `slice()` both guarantees that and
    // gives you a buffer you can transfer without neutering the source array.
    data: rowMajor.slice().buffer,
  });
  sampleIndex += rows;
}
```

Other producers on the same engine:

- `{ t: "metricRow", clientStreamId, timeUs, row }` — one metrics object
  (`rppg-metrics@1`, `ppg-metrics@1`)
- `{ t: "irregular", clientStreamId, rows, timesUs, data }` — explicit per-row
  times (`Float64Array` µs) with row-major values
- `{ t: "event", events: [{ timestampUs, kind, name, payload }] }` — markers
- `{ t: "clock", observations: [...] }` — device-clock / UTC alignment samples
- `{ t: "discontinuityHint", clientStreamId, reason }` — attribute the next
  detected gap (e.g. `"ble-reconnect"`)

A batch arriving more than two sample periods off the nominal timeline closes
the current chunk and records a `DiscontinuityV1` (`gap` / `dropout` forward,
monotonic-clamped `clock-jump` backward). Samples are never interpolated across
one.

### 6. Finalize

```ts
core.handle({ t: "stream/close", clientStreamId: "eeg", endUs: clock.nowUs() });
core.handle({ t: "session/stop", mode: "finalize" });
// wait for the `closed` emission, then:
clearInterval(ticker);
```

`session/stop` flushes every partial chunk, waits for outstanding ACKs, closes
each stream, and only then sends `session/finalize`. Use `mode: "abort"` to end
a session without finalizing. When the engine's retained buffer crosses the hard
limit it aborts on its own with `storage_unavailable` rather than dropping data
silently.

## Device adapters

The adapters wrap live SDK objects as a `BiosignalSource` (`descriptor()`,
`streams()`, `start(sink)`, `stop()`). Peer dependencies are type-only, so
importing the package does not pull in a device SDK:

- `createHeadbandSource(transport, options?)` — a `HeadbandTransport` from
  `@elata-biosciences/eeg-web` / `eeg-web-ble`
- `createRppgSource(options)` — an `@elata-biosciences/rppg-web` session
- `createPpgSource(options)` — `@elata-biosciences/ppg-web` metrics

A source writes into a `SourceSink` that your app supplies — the sink translates
`openStream` / `pushRegular` / `pushMetricRow` / `event` / `close` into the
engine messages shown above. There is no shipped UI-thread facade yet; the
reference bridge is the `sink` built by `createRecorderHarness` in
`@elata-biosciences/biosignal-session/testing`, which is small enough to copy.

## What the host must guarantee

If you are implementing the trusted side, `createMemoryHost` in `./testing` is
the executable specification. The rules that matter:

- **ACK means durable.** Reply `ok` to `chunk/commit` only after the payload and
  its catalog row are committed. Everything else in the protocol assumes this.
- **Sequences are strictly contiguous per stream.** A duplicate sequence with an
  identical checksum is an idempotent replay of a lost ACK → reply `ok` with the
  stored result. A duplicate with a different checksum, or a gap, is a fatal
  `sequence_conflict`.
- **Re-verify the checksum** (`crc32cHex`) on arrival; mismatch →
  `checksum_mismatch`, which the client resends.
- **Enforce the limits** in `BIOSIGNAL_LIMITS`: 8 MiB per chunk, 100 events per
  batch, 4 KiB per event payload, 100 non-chunk ops per 60 s.
- **Never buffer unboundedly** — the client's in-flight window paces delivery.

## Testing your integration

```ts
import {
  createRecorderHarness,
  createSyntheticSource,
} from "@elata-biosciences/biosignal-session/testing";

const h = createRecorderHarness();          // RecorderCore + in-memory host + fake clock
const source = createSyntheticSource({ seed: 1234 });

await h.start();
await h.startSource(source);
source.pump(60_000);                        // 60 s of virtual signal
await h.advance(60_000);
await source.stop();
await h.finalize();

h.core.state();                             // "complete"

const [streamId] = [...h.host.streams.keys()];
h.host.chunksForStream(streamId);           // committed chunks, in sequence
h.host.committedBytes();                    // total payload bytes
```

The synthetic source is seeded and deterministic: same seed and config, same
bytes. It produces alpha-modulated EEG over eyes-open/eyes-closed epochs, full
`rppg-metrics` and `ppg-metrics` rows, epoch marker events, drifting device
clock observations, and optional dropout windows.

The in-memory host injects faults so you can prove your error handling:
`dropNextAck()`, `failNextCommitWith(code)`, `corruptNextPayload()`,
`pause()` / `resume()` for backpressure, and `notify(notice)` for
`session-invalidated`.

Because the fake clock is linked to the engine's retry and heartbeat timers,
hours of virtual recording run in seconds — see
`src/__tests__/endurance.test.ts` for an 8-hour session with exact expected
chunk counts.

## Reading chunks back

```ts
import {
  checksumOf,
  decodeChunk,
  readFloat32Column,
  readTimeUsColumn,
} from "@elata-biosciences/biosignal-session/browser";

const { table, rowCount, columnNames, identity } = decodeChunk(bytes);
const tp9 = readFloat32Column(table, "TP9");
```

Every chunk is a complete, independently decodable Arrow IPC **file**, carrying
its own schema and its `sessionId` / `streamId` / `arrowSchemaId` in schema
metadata. No catalog row and no neighbouring chunk is needed to interpret one
payload — which is what makes local export, re-import, and offline analysis
straightforward.

## Related

- `packages/biosignal-session/README.md` — protocol summary and benchmark results
- `packages/biosignal-session/llms.txt` — integration contract for AI tools
- [repo-map.md](../repo-map.md) — package ownership
- `@elata-biosciences/biosignal-analytics` — analysis over what you recorded
