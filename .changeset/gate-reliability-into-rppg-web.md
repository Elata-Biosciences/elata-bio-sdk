---
"@elata-biosciences/rppg-web": minor
---

Add the reliability-gating surface: `trustedHrvSample`, `calibrationStage`,
camera-frozen-frame detection (`initialLiveness`/`observeFrame`/etc.),
`landmarkMotion`, and `fitExposureResponse`. Extracted from three independent
consumer apps (peak-app, vitality-app, neural-chat-app) that had each been
hand-copying and re-drifting this exact logic. See elata-bio-sdk#24/#26/#405.

Deliberately excludes display copy and CSS tone classes (`CALIBRATION_LABEL`,
`calibrationLabelTone`, `signalTier`'s tone field): each app's own framing
(work vs. recovery vs. chat) genuinely differs and stays app-owned.
