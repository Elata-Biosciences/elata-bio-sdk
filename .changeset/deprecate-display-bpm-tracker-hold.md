---
"@elata-biosciences/rppg-web": patch
---

Document `DisplayBpmTracker`/`hold()` as deprecated. `hold()` keeps a display
value alive on a cycle the caller has already deemed untrustworthy, which is
the exact holdover pattern `resolveDisplayMetrics` exists to make
structurally impossible (elata-bio-sdk#24, neural-chat-app#10,
elata-bio-sdk#27). No current consumer uses this class; use
`resolveDisplayMetrics` for a production display-trust decision instead. No
behavior change.
