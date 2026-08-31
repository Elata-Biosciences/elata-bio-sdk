---
"@elata-biosciences/biosignal-session": minor
---

Add the biosignal-session package: Session V1 contracts (Session → Source →
Stream → Chunk → Event), the `__elata_biosignal_init` MessagePort wire
protocol with durable-ACK semantics, CRC32C chunk checksums, and Arrow IPC
chunk encoding/decoding for EEG/PPG/optics/IMU/rPPG streams. Raw biosignal
data recorded through this protocol is local-only by default.
