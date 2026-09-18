---
"@elata-biosciences/rppg-web": patch
---

Revert the September display-trust and reliability-gating work shipped in 0.15.0: resolveDisplayMetrics, the reliability-gating surface, calibration, cameraLiveness, captureProgress, exposureFit, hrvSampleTrust, motionIndex, RGB-space multi-ROI weighting, and shouldDeclareNoFrame. The surface was merged faster than it could be reviewed against real capture behaviour. 0.15.0 stays on npm; consumers should move to this patch.
