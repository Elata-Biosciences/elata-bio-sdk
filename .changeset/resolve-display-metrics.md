---
"@elata-biosciences/rppg-web": patch
---

Add `resolveDisplayMetrics(snapshot)`, the single stateless decision for
"what BPM should this app show right now" — a pure snapshot-in, decision-out
mapping with no accumulator to hold a stale value past the point the SDK's
own gating (`canPublish`/`publishBpm`) says a reading is no longer
trustworthy. Extracted after three independent consumer apps each wrote
their own version of this decision and at least two got it wrong the same
way (elata-bio-sdk#24, neural-chat-app#10, peak-app#404/#408).

`hrvRmssd` on the returned shape is intentionally always `null` for now —
HRV needs a stricter, beat-to-beat quality gate that hasn't landed yet (see
elata-bio-sdk#28's `trustedHrvSample`); the field stays in the shape so
wiring it up later isn't a breaking change.
