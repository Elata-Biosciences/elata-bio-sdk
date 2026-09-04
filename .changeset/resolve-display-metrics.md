---
"@elata-biosciences/rppg-web": patch
---

Add `resolveDisplayMetrics(snapshot)`, the single stateless decision for
"what BPM/HRV should this app show right now" — a pure snapshot-in,
decision-out mapping with no accumulator to hold a stale value past the
point the SDK's own gating says a reading is no longer trustworthy.
Extracted after three independent consumer apps each wrote their own
version of this decision and at least two got it wrong the same way
(elata-bio-sdk#24, neural-chat-app#10, peak-app#404/#408).

`bpm` is gated by `canPublish`/`publishBpm`. `hrvRmssd` composes that gate
with the stricter, HRV-specific `trustedHrvSample` (elata-bio-sdk#28) —
beat-to-beat timing is far more fragile than an average rate, so a sample
can clear the BPM gate and still carry a garbage HRV figure.
