# Proposal: face-framing (positioning) guidance in rppg-web

## Problem

During calibration, consumers want to tell the user **how to fix their
framing** — "move closer", "center your face", "you're too high in frame". The
SDK can't: `RppgGuidanceCode` today is only

```
idle | no_face | increase_lighting | finding_pulse | calibrating | active_monitoring | motion_hold
```

— no distance/centering/framing. So every consumer reimplements it:

- **tradelock** runs its own `FaceLandmarker` + landmark geometry for this.
- **Vitality** currently drives a stopgap from the `FaceLandmarker` it already
  runs for affect (`faceFraming.ts`), shaped to lift straight into this SDK.

That's duplication of **signal-domain** logic that's identical across apps —
and a mis-framed face is *why* SNR drops, so it's squarely the SDK's concern.

## Why it belongs here

The SDK **already computes the face bounding box** internally for its ROI crop
(`computeFaceRoiRects`, 5th/95th-percentile landmark box, `faceMesh: 'auto'`).
It has the geometry; it just discards it instead of turning it into guidance.
Consumers don't get the box (the managed session doesn't expose landmarks), so
they each load a *second* face model to recover what the SDK already knows.

## Proposed API

1. **Extend `RppgGuidanceCode`** with positioning codes:

   ```ts
   export type RppgGuidanceCode =
     | /* …existing… */
     | 'move_closer' | 'move_back'
     | 'center_face' | 'face_too_high' | 'face_too_low';
   ```

   These flow through the **existing** `RppgGatingOutput["guidance"]` /
   `RppgAppSnapshot.guidance` channel — no new surface for consumers to wire.

2. **Pure mapping** (ready to copy from Vitality's `faceFraming.ts`):

   ```ts
   interface FaceBox { x: number; y: number; width: number; height: number } // 0..1
   interface FramingThresholds { minWidth: number; maxWidth: number; centerTol: number }

   function faceFramingFromBox(box: FaceBox | null, t?: FramingThresholds): { code, message }
   function faceBoxFromLandmarks(landmarks: {x:number;y:number}[]): FaceBox | null
   ```

   Defaults `{ minWidth: 0.22, maxWidth: 0.62, centerTol: 0.16 }` (face-width
   fraction of frame). Priority: distance → horizontal → vertical → `ok`.
   Messages are **head-relative** ("lower your head or raise the camera") so
   they're unambiguous regardless of how the camera is mounted.

3. **Wire it where the box already exists** — the ROI step computes the landmark
   box per frame; feed it to `faceFramingFromBox` and fold the result into the
   gating guidance (positioning ranks below `no_face`/lighting, above
   `finding_pulse`). Make thresholds part of `RppgGatingOptions`.

## Migration

- Vitality: delete `src/faceFraming.ts` + the `framing` plumbing in
  `PulseContext`/`BaselineCapture`; render `snapshot.guidance.code` for the new
  codes instead. (Also lets Vitality drop the second FaceLandmarker if affect
  later moves into the SDK too.)
- tradelock: delete its bespoke framing logic; render the guidance codes.

## Reference implementation

`src/faceFraming.ts` in the Vitality repo is written as a pure, dependency-free
module specifically so it ports here with ~no changes; its tests
(`faceFraming.test.ts`) come along too.
