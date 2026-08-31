---
"@elata-biosciences/biosignal-session": minor
---

Add the Elata Biosignal Session v1 package: the Session → Source → Stream → Chunk
→ Event contracts, a session-relative microsecond time model, the Arrow IPC chunk
codec with CRC32C integrity, the MessagePort recording protocol (13 ops, bounded
limits, in-flight windowing and rate limiting), a recorder core with idempotent
replay, a dedicated recording worker, and Headband/PPG/rPPG source adapters.

Storage deliberately lives in the consuming host, not in this package: the SDK
defines the contracts and the wire, the host owns durability. See
`docs/architecture-biosignal-session-v1.md` for the format design this builds on.
