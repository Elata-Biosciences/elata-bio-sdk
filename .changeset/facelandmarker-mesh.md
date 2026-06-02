---
"@elata-biosciences/rppg-web": minor
---

Replace legacy MediaPipe FaceMesh with tasks-vision FaceLandmarker, and wire
affect end-to-end.

The face tracker now emits ARKit-style **blendshapes** (and raw landmarks) on
each `Frame`, which feed valence/arousal estimation. A new `AffectTracker`
(resting HR/HRV baseline + face/physiology fusion) is computed in the app
adapter and surfaced as `snapshot.affect` (an `AffectState`); pass
`affect: false` to disable. Valence comes from the face; arousal is
physiology-primary (rPPG HR/HRV vs the auto-calibrated baseline) fused with the
face, each gated by confidence.

**BREAKING:**
- `loadFaceMesh` → `loadFaceLandmarker` (now loads `@mediapipe/tasks-vision`
  from CDN via ESM; asset URLs are configurable via `LoadFaceLandmarkerOptions`).
- `FaceMeshLike` → `FaceLandmarkerLike` (`detectForVideo`-based; the legacy
  `onResults`/`send` shape is gone). `MediaPipeFaceFrameSource` now takes a
  `FaceLandmarkerLike`. The `createRppgSession({ faceMesh })` option key is
  unchanged but accepts a `FaceLandmarkerLike` instance.

New exports: `loadFaceLandmarker`, `AffectTracker`, and types
`FaceLandmarkerLike`, `FaceLandmarkerResult`, `LoadFaceLandmarkerOptions`,
`FrameBlendshape`, `FaceLandmarkPoint`, `AffectBaseline`, `AffectTrackerOptions`.
