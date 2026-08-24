# @elata-biosciences/biosignal-session

Local-first biosignal session recording for Elata apps: shared contracts, a
fault-tolerant MessagePort wire protocol, and Arrow IPC chunk encoding.

A session is one recording episode following the model
**Session → Source → Stream → Chunk → Event**:

- **Session** — lifecycle + identity + the time anchor. Canonical time is
  session-relative integer microseconds from a `(Date.now(), performance.now())`
  pair captured at creation.
- **Source** — one runtime producer (Muse/Athena headset, webcam rPPG,
  synthetic).
- **Stream** — one independently sampled, typed sequence (`eeg`, `ppg`,
  `optics`, `imu`, `battery`, `rppg-trace`, `rppg-metrics`, `ppg-metrics`, …).
- **Chunk** — an immutable, independently decodable Arrow IPC *file* payload
  with a `(sessionId, streamId, sequence)` idempotency identity and a CRC32C
  checksum.
- **Event** — sparse annotations/markers, kept out of the Arrow plane.

Raw biosignal data recorded through this protocol is **local-only by
default**: the trusted host commits chunks to browser storage (OPFS payloads +
an IndexedDB catalog) and ACKs only after a durable local commit. There is no
remote mirror in this package.

## Entry points

| Entry | Contents |
| --- | --- |
| `.` | DOM-free contracts, protocol types, error codes, time helpers, CRC32C |
| `./browser` | Source adapters + Arrow chunk encode/decode (browser recording) |
| `./testing` | Deterministic PRNG, fake clock, synthetic sources for tests |

## Protocol at a glance

The host creates a `MessageChannel`, posts
`{ kind: "__elata_biosignal_init", v: 1 }` to the app iframe with `port2`
transferred, and the client captures the port one-shot. Chunk payloads are
transferred `ArrayBuffer`s; the reply to `chunk/commit` arrives only after the
payload and its catalog row are durably committed. Retries with the same
`(sessionId, streamId, sequence)` and checksum are idempotent; a differing
checksum is a fatal `sequence_conflict`.

See `llms.txt` and the type declarations in `dist/` for the full contract.

## Benchmark results (2026-08-20)

`bench/protocolBenchmark.mjs` (`pnpm bench`, after `pnpm build`) drives the real
`RecorderCore` against `createMemoryHost` over a loopback `MessagePort` pair,
fed by `createSyntheticSource`, across chunk target {64 KiB, 256 KiB, 1 MiB} ×
in-flight window {2, 4, 8} on the wide layout. It reports encode ms/chunk, ACK
round-trip latency, sustained MiB/s, peak in-flight bytes and chunk counts, and
runs a host-stall probe per cell. Raw output is not committed — re-run it to
reproduce.

Measured on node 24 / darwin-arm64. **Structural numbers (rows per chunk, chunk
duration, payload size, chunk counts, retained bytes) are exact and
deterministic; timings vary ±40 % run to run**, so they are quoted to one
significant figure.

**Chunk geometry under the shipped 30 s duration cap**

| profile | target | rows/chunk | chunk duration | payload/chunk | closed by |
| --- | --- | --- | --- | --- | --- |
| 4 ch @ 256 Hz | 64 KiB | 4096 | 16.0 s | 64 KiB | byte target |
| 4 ch @ 256 Hz | 256 KiB | 7680 | 30.0 s | 121 KiB | 30 s cap |
| 4 ch @ 256 Hz | 1 MiB | 7680 | 30.0 s | 121 KiB | 30 s cap |
| 16 ch @ 1000 Hz | 64 KiB | 1024 | 1.0 s | 66 KiB | byte target |
| 16 ch @ 1000 Hz | 256 KiB | 4096 | 4.1 s | 255 KiB | byte target |
| 16 ch @ 1000 Hz | 1 MiB | 16384 | 16.4 s | 989 KiB | byte target |

**Headline timings** (16 ch @ 1000 Hz, the profile where the byte target binds)

| target | encode ms/chunk | encode MiB/s | ACK p50 ms | ACK p95 ms | CPU % of realtime |
| --- | --- | --- | --- | --- | --- |
| 64 KiB | ~0.6 | ~100 | ~0.8 | ~1.5 | ~0.3 % |
| 256 KiB | ~2.6 | ~100 | ~3 | ~6 | ~0.2 % |
| 1 MiB | ~7.4 | ~130 | ~11 | ~14 | ~0.2 % |

At 4 ch @ 256 Hz every cell costs 0.01–0.07 % of one core; encode is
0.3–0.8 ms/chunk. ACK latency is against the in-memory host (checksum
re-verification plus catalog bookkeeping) — a real OPFS + IndexedDB host adds
its own durability cost on top of these numbers.

**In-flight window.** In steady state the window is inert: the host ACKs before
the next chunk closes, so peak retention is exactly one chunk at every window
setting and throughput does not vary with it. The window is only observable
under a stalled host, where it does exactly what it specifies — max unACKed
chunks equals the window (2/4/8 measured at 64 KiB, where a full window fits
inside the 15 s ACK timeout). Retained bytes during a stall scale with stall
duration × byte rate, not with the window; worst case measured was 5.04 MiB
(15.7 % of the 32 MiB soft limit) at 1 MiB × window 8.

### Chosen defaults

**The shipped defaults — `chunkTargetBytes` 256 KiB, `inFlightWindow` 4 — are
supported by this data and are not changing.**

- **256 KiB target.** For the consumer headset profile the 30 s duration cap
  binds first, so 256 KiB and 1 MiB produce *identical* 121 KiB / 30 s chunks —
  raising the target buys nothing there. For high-rate streams 256 KiB keeps a
  chunk at ~4 s of data (bounded crash loss, bounded recovery) and each commit
  blocks for single-digit milliseconds. 1 MiB triples per-commit blocking
  (~11 ms p50) and stretches a chunk to 16.4 s of unACKed data for no
  throughput gain; 64 KiB shortens the loss window further but quadruples chunk
  count and per-chunk protocol overhead at equal encode throughput.
- **Window 4.** No throughput evidence discriminates the window with a
  same-thread host, so the choice rests on what it bounds: unACKed retention
  (4 × 256 KiB = 1 MiB, 3 % of the soft buffer limit) and resend cost after a
  host failure. Window 8 doubles both for no measured benefit; window 2
  under-pipelines the moment a host commit acquires real latency.
- The 30 s `chunkMaxDurationUs` cap, not the byte target, is what governs
  ordinary consumer sessions. It is the constant to revisit first if chunk
  granularity ever needs tuning.

## Cross-language verification

A chunk is only useful if something other than this library can read it.
`scripts/cross-language/` emits one chunk per Arrow schema and verifies them
with **pyarrow** — independently re-reading the files, recomputing the CRC32C
in Python, checking the Elata identity metadata survived, and asserting the
time-column contract (regular streams carry no time column; irregular streams
carry an `int64` microsecond column, never an Arrow timestamp type, which
would imply an epoch these values do not have).

```bash
pnpm build && pnpm run verify:cross-language   # needs python3 with pyarrow
```

If the JS and Python readers ever disagree, the chunk format is the problem.
