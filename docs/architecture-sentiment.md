# Sentiment Analysis Architecture

Status: In progress

## Summary
Provide a lightweight facial sentiment module that runs on-device and produces coarse labels
(Neutral, Happy, Stressed, Surprised, Focused, Fatigue) plus confidence and acute-stress cues.
This is a heuristic, calibration-based classifier built on MediaPipe FaceMesh landmarks.

## Reference implementation
- Existing internal app logic for `analyzeSentiment`, calibration, smoothing, and labels.
- Existing helper for landmark-distance metrics.
- Existing stress/tilt integration model.

## High-level pipeline
1) Camera capture
2) Face landmarks (MediaPipe FaceMesh)
3) Feature extraction (normalized distances)
4) Baseline calibration
5) Temporal smoothing + acute stress weighting
6) Label classification + outputs

## Components

### Landmark source (platform-specific)
- Web: MediaPipe FaceMesh via `getUserMedia`.
- Native: platform camera + MediaPipe/native landmark detector.
- Output: normalized face landmarks, timestamp, face-found flag.

### Feature extraction (pure logic)
Compute four normalized metrics (scaled by inter-eye distance):
- Smile curve (mouth corners vs center lip).
- Brow height (brow to eye distance).
- Brow distance (inner brow separation).
- Eye openness (upper vs lower eyelid).

### Baseline calibration
- During calibration, buffer feature metrics and compute an average baseline.
- Baseline is used for per-user deltas to reduce bias.

### Smoothing + acute stress
- Maintain a rolling history (last ~15 frames).
- Use mean-smoothed metrics for stability.
- Detect acute stress with stricter thresholds and bias smoothing when sustained.

### Classification (heuristic)
Use deltas vs baseline to assign a label:
- Happy: smile delta above threshold.
- Surprised: brow height delta above threshold.
- Stressed: brow distance or brow height below threshold.
- Fatigue: eye openness below threshold.
- Focused: eye openness above threshold or slightly lowered brows.
- Neutral: otherwise.

### Outputs
- Label: `Neutral|Happy|Stressed|Surprised|Focused|Fatigue`.
- Optional: confidence score, feature deltas, acute stress counter.
- Downstream: feed into stress/tilt logic as a soft cue.

## Distribution strategy (hybrid)
- Keep camera + landmarks in JS/native (MediaPipe).
- Keep sentiment core as a pure, reusable module (TS or Rust WASM).
- Prefer TS for fast iteration; only move to Rust if needed for consistency.
- If exposed on web, publish via a small wrapper package (similar to `packages/eeg-web`).
