---
"@elata-biosciences/rppg-web": minor
---

Add `shouldDeclareNoFrame`, the correct zero-frames-ever check for a consumer
deciding whether to tear down and reacquire a video element that has no
decodable frame right now.

`pastStartupGrace` alone (the function this module's own doc comment
previously pointed a zero-frame caller at) gates on elapsed time only, but
`startedAt` never moves once a real frame lands, so `pastStartupGrace` stays
true for the rest of the session once the grace period clears. A single
missed `readyState`/`videoWidth` tick anytime after that, even deep into an
otherwise-healthy reading, was therefore indistinguishable from a camera that
never started at all, and forced a mid-reading reacquire off `pastStartupGrace`
by itself.

`shouldDeclareNoFrame` additionally requires `liveness.signature` to still be
`null` (no frame has EVER been sampled this session), the one condition that
actually holds for "never started" and not for "started fine, one bad tick."
Found independently in both consumer forks of this module (peak-app,
vitality-app) before either had migrated onto this package; landing the fix
here means neither fork (nor a future one) inherits it a third time.
