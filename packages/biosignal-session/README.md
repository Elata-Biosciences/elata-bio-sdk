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
