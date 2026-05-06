# rPPG Multi-ROI And Learned Reconstruction Design

Status: design note for the next rPPG quality roadmap. This document expands
Phase 4.5 and Phase 4.6 from [implementation-plan-rppg.md](implementation-plan-rppg.md).
It is maintainer-facing, not a consumer integration guide.

Consumer browser apps should continue to start with
`@elata-biosciences/rppg-web` and `createRppgSession()`.

## Purpose

The current rPPG stack can estimate pulse from browser video, but the browser
path merges face regions before the Rust core sees them. That keeps the runtime
simple, but it limits what the Rust/WASM pipeline can learn about which face
regions are actually useful in the current lighting, pose, and motion context.

This document proposes two connected upgrades:

1. **Phase 4.5: Multi-ROI waveform construction**
   Keep forehead, cheek, and later landmark-patch signals separate into
   Rust/WASM. Compute per-region quality and candidate rPPG views, then fuse
   before BPM estimation.

2. **Phase 4.6: Learned reconstruction and distilled low-latency models**
   Train larger offline teacher models against contact PPG, then distill them
   into small causal student models that can run in Rust/WASM with low latency.

## Paper Summary

Reference:

- Rodrigo Castellano Ontiveros, Mohamed Elgendi, and Carlo Menon,
  "A machine learning-based approach for constructing remote
  photoplethysmogram signals from video cameras," Communications Medicine 4,
  109 (2024), https://doi.org/10.1038/s43856-024-00519-6.
- Code referenced by the paper:
  https://github.com/rodrigo-castellano/ML_based_rPPG_construction.

The paper's useful idea is not to train a huge model directly from video frames.
Instead, it builds a cleaner rPPG waveform from compact signal features:

- Extract face regions with MediaPipe through pyVHR.
- Use 30 landmark patches:
  - 10 forehead patches.
  - 10 left cheek patches.
  - 10 right cheek patches.
- Compute average RGB traces for those patches.
- Generate classical rPPG candidate signals using algorithms such as POS,
  CHROM, LGI, and ICA.
- Train a sequence model against contact PPG so the output waveform resembles
  the contact PPG morphology, not only the dominant BPM frequency.
- Evaluate both waveform and heart-rate behavior across datasets and activity
  conditions.

The paper evaluates against public datasets including PURE, LGI-PPGI, and
MR-NIRP. It uses metrics that matter for waveform reconstruction:

- Pearson correlation for linear similarity.
- RMSE for pointwise error.
- Dynamic Time Warping for morphology similarity when signals are slightly
  shifted or stretched.
- Absolute HR difference from frequency-domain HR estimation.

The key lesson for this repo: keep multiple weak rPPG views alive longer. If
the runtime merges all regions too early, a noisy cheek, shadowed forehead, or
motion-corrupted patch can poison the one aggregate signal before the core
pipeline can reject it.

## Current Repo Baseline

Current high-level flow:

```text
browser video
  -> TypeScript canvas capture
  -> optional MediaPipe FaceMesh ROI
  -> average RGB/green from ROI(s)
  -> RppgProcessor
  -> WASM RppgPipeline
  -> POS-style Rust pipeline
  -> temporal normalization, bandpass, Welch/SNR, harmonic selection
  -> metrics
```

Important current behavior:

- `MediaPipeFaceFrameSource` can emit face sub-ROIs for forehead, left cheek,
  and right cheek.
- `DemoRunner` aggregates those sub-ROIs into one RGB sample before pushing
  into the processor.
- The Rust pipeline computes SNR and signal quality on the already-merged
  waveform.
- The core therefore cannot currently select, reject, or weight individual
  ROIs based on their own SNR or waveform agreement.

This is the main limitation Phase 4.5 should address.

## Phase 4.5: Multi-ROI Waveform Construction

### Goals

- Preserve per-region information until Rust/WASM can score it.
- Compute per-region quality and SNR.
- Add classical candidate views per region or region group.
- Fuse candidate signals before BPM estimation.
- Keep the public API simple and backward compatible.
- Avoid sending raw video pixels into WASM.

### Non-Goals

- Do not replace `createRppgSession()` as the consumer entrypoint.
- Do not require ML inference for the first multi-ROI implementation.
- Do not ship training datasets or training code in production bundles.
- Do not make clinical claims from waveform morphology.

### Proposed Runtime Flow

```text
TypeScript capture
  -> named ROI sample extraction
  -> compact RoiSample[] per frame
  -> WASM push_multi_roi_sample(...)
  -> Rust per-region rolling buffers
  -> candidate generation: GREEN, POS, CHROM, later GRGB/LGI/ICA
  -> per-region and per-candidate quality scoring
  -> deterministic fusion into reconstructed waveform
  -> existing BPM / confidence / gating pipeline
  -> metrics + diagnostics
```

### ROI Tiers

Start small and make each tier measurable.

**Tier 1: three named regions**

- Forehead.
- Left cheek.
- Right cheek.

This matches the current `MediaPipeFaceFrameSource` shape and minimizes API
churn. It is enough to validate whether per-region quality improves bad
windows.

**Tier 2: thirty landmark patches**

- 10 forehead patches.
- 10 left cheek patches.
- 10 right cheek patches.

This mirrors the paper's data shape more closely and gives better spatial
redundancy. Each patch should be reduced to compact RGB and quality stats in
TypeScript before crossing into WASM.

**Tier 3: device/runtime-specific ROI sets**

Future native clients or improved face trackers may emit different region
layouts. The Rust API should accept stable region IDs and optional group labels
so the fusion layer can handle this without hard-coding only one layout.

### TypeScript Sample Shape

The TypeScript side should keep all browser-only work outside WASM:

- Camera access.
- Canvas `drawImage`.
- `getImageData`.
- MediaPipe/FaceMesh execution.
- Pixel averaging and skin/clipping stats.

Candidate sample shape:

```ts
type RppgRoiGroup = "forehead" | "left_cheek" | "right_cheek" | "unknown";

type RppgRoiSample = {
  id: number;
  group: RppgRoiGroup;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  g: number;
  b: number;
  skinRatio: number;
  clipRatio: number;
  motion: number;
};

type RppgMultiRoiFrame = {
  timestampMs: number;
  rois: RppgRoiSample[];
};
```

This shape should remain internal or advanced at first. The stable consumer API
can continue exposing only `createRppgSession()` and metrics.

### Rust Sample Shape

Candidate Rust-side structures:

```rust
pub enum RoiGroup {
    Forehead,
    LeftCheek,
    RightCheek,
    Unknown,
}

pub struct RoiSample {
    pub id: u16,
    pub group: RoiGroup,
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub skin_ratio: f32,
    pub clip_ratio: f32,
    pub motion: f32,
}

pub struct MultiRoiFrame {
    pub timestamp_ms: i64,
    pub rois: Vec<RoiSample>,
}
```

For WASM, start with a JSON bridge or flat arrays depending on implementation
speed. For performance, flat typed arrays are preferable:

- `ids: Uint16Array`
- `groups: Uint8Array`
- `rgb: Float32Array` with `[r0, g0, b0, r1, g1, b1, ...]`
- `quality: Float32Array` with `[skin0, clip0, motion0, ...]`

The initial implementation can use a simpler bridge if it keeps the public API
private and measurable.

### Per-Region Buffers

Rust should maintain rolling buffers per region ID:

- timestamps
- RGB samples
- skin ratio
- clipping ratio
- motion
- derived candidate signals
- recent quality summaries

A region buffer should expire if it stops receiving samples or if the face
tracking layout changes.

Suggested windowing:

- Keep 2x the main window duration, as the current `RppgPipeline` does.
- Use the most recent 6-10 seconds for signal construction.
- Update cheap quality features every frame.
- Update spectral quality once per 0.5-1.0 seconds.

### Region Quality Features

Cheap features:

- Valid sample count.
- Freshness.
- Skin ratio mean and low percentile.
- Clip ratio mean.
- Motion mean.
- RGB variance.
- Green-channel temporal variance.
- Dropout rate.

Spectral/waveform features:

- In-band SNR.
- Peak sharpness.
- Dominant BPM.
- Harmonic ambiguity.
- Autocorrelation periodicity.
- Agreement with neighboring regions.
- Agreement with group-level or global estimate.

Quality should not be a single magical score internally. Keep component scores
available in diagnostics so the team can see why a region was downweighted.

### Candidate Views

Start with cheap classical views:

**GREEN**

- The green trace or normalized green trace.
- Useful as a baseline and fallback.
- Very cheap.

**POS**

- Current Rust pipeline already uses a POS-style RGB projection.
- First-class baseline for the multi-ROI path.

**CHROM**

- Add as a second RGB projection method.
- Often strong under skin-tone and illumination changes.
- Cheap enough for Rust/WASM.

**GRGB**

- A simple green-red/green-blue style baseline can be useful as another weak
  view if implementation remains small.

**LGI and ICA**

- Defer until POS+CHROM+GREEN are measured.
- They may add complexity or cost without enough incremental value for a
  browser runtime.

### Fusion Strategy

The first fusion layer should be deterministic.

Warmup:

- Use current aggregate behavior or area/skin-ratio weighting.
- Avoid pretending per-region SNR is meaningful before enough samples exist.

Quality-weighted fusion:

- Compute region weights from quality components.
- Suppress regions with severe clipping, poor skin ratio, stale samples, or
  excessive motion.
- Prefer candidate views that agree on BPM and waveform periodicity.
- Blend weights gradually to avoid output jumps.

Candidate fusion:

- Generate candidate waveforms or candidate BPM evidence from each region group
  and method.
- Weight by region quality, candidate SNR, peak sharpness, and agreement.
- Fuse into a reconstructed waveform when possible.
- Continue to expose BPM evidence for debugging and gating.

Fallback:

- If multi-ROI evidence is weak, fall back to the existing aggregate pipeline.
- Diagnostics should state the fallback reason.

### Output Metrics And Diagnostics

The public app snapshot should remain compact:

- `bpm`
- `confidence`
- `signal_quality`
- current state/guidance

Advanced diagnostics should include:

- `roi_count`
- `active_roi_count`
- per-region quality summaries
- dropped regions and reasons
- selected/fused region weights
- candidate method weights
- per-region SNR
- per-method agreement
- fallback reason
- feature schema version

### Latency And Compute Budget

This should be cheap if implemented carefully.

The expensive browser work remains:

- MediaPipe FaceMesh.
- Canvas capture.
- `getImageData`.
- Pixel iteration.

The Rust-side multi-ROI work is small by comparison:

- 3-30 regions.
- 30 fps.
- 6-10 second rolling windows.
- cheap stats every frame.
- spectral stats once per second or similar.

The fusion layer should not add output latency. It should improve weighting as
evidence accumulates:

- first seconds: current/simple weighting
- after enough samples: per-region quality weighting
- after stable evidence: candidate-method fusion

### Backward Compatibility

Keep existing paths:

- `push_sample`
- `push_sample_rgb`
- `push_sample_rgb_meta`
- current `RppgPipeline`
- current `createRppgSession()` behavior

Add the multi-ROI path behind opt-in configuration:

```ts
const session = await createRppgSession({
  video,
  backend: "auto",
  faceMesh: "auto",
  experimentalMultiRoi: true,
});
```

The exact option name can change before release. The important rule is that
default consumer behavior stays stable until validation is good.

### Phase 4.5 Milestones

1. Add Rust data structures and unit tests for region buffers.
2. Add a deterministic three-region `MultiRoiRppgPipeline`.
3. Add POS per region and quality-weighted fusion.
4. Add CHROM and GREEN/GRGB candidate views.
5. Add WASM bindings behind an internal or experimental API.
6. Update `packages/rppg-web` to emit named ROI samples.
7. Add diagnostics and replay fixtures.
8. Compare against the current aggregate pipeline.
9. Expand to 30 landmark patches if three-region results justify it.

## Phase 4.6: Learned Reconstruction And Distilled Low-Latency Models

### Why Not Ship A Large Model Directly?

Large sequence models are useful for research and offline training, but they are
not the right first production runtime target for browser WASM:

- They increase bundle and maintenance cost.
- They complicate deterministic fallback.
- They can add latency if they require full windows.
- They are harder to audit than classical DSP.

Instead, use a teacher/student workflow.

### Teacher/Student Overview

```text
offline datasets + contact PPG
  -> production Rust feature generator
  -> large teacher model
  -> teacher waveform / soft fusion targets
  -> small causal student model
  -> exported static Rust weights
  -> low-latency WASM inference
```

The teacher can be slow and expressive. The student must be small, causal, and
easy to run inside the existing Rust/WASM pipeline.

### Offline Training Harness

The offline harness should not duplicate production feature logic in Python if
we can avoid it. Prefer running the Rust feature generator over recorded inputs
so training sees the same features the browser runtime will produce.

Inputs:

- public or internal videos
- face landmarks or precomputed ROI samples
- contact PPG reference signals
- activity labels when available
- subject/session metadata for validation splits

Generated features:

- per-region RGB traces
- POS/CHROM/GREEN/GRGB candidate signals
- skin ratio
- clipping
- motion
- SNR
- peak sharpness
- candidate BPMs
- candidate agreement

Labels:

- normalized contact PPG waveform
- optionally aligned waveform target
- optional beat markers or derived HR, but not as the only objective

Alignment:

- Use cross-correlation or DTW during training/evaluation to handle reference
  timing offsets.
- Keep runtime inference causal. The runtime model should not require future
  frames.

### Teacher Model

The teacher can use:

- non-causal context
- full 10-second windows
- richer feature sets
- slower inference
- ensembling
- attention or recurrent layers

Teacher objectives:

- reconstruct normalized contact PPG morphology
- preserve dominant pulse frequency
- reduce noise and motion artifacts
- avoid optimizing only for BPM

The teacher can output:

- reconstructed waveform
- confidence or uncertainty
- soft weights over candidate regions/methods
- quality labels for training the student

### Student Model

The production student should be causal and tiny.

Recommended first candidates:

**Linear or shallow MLP fusion**

- Input: candidate values and quality scores for the current sample/window.
- Output: candidate weights or reconstructed waveform sample.
- Easiest to implement and audit.

**Tiny causal temporal convolution network**

- Input: short feature history.
- Output: waveform sample or candidate weights.
- Good latency and simple static inference.
- Usually easier to run efficiently than LSTM in custom Rust.

**Small GRU**

- Useful if temporal state matters more than a small convolution can capture.
- More complex than TCN, but still manageable if tiny.

Avoid a full LSTM as the first production student unless validation shows it is
clearly worth the extra complexity.

### Student Inputs And Outputs

Inputs should be compact signal features, not image frames.

Candidate input vector per step:

- fused POS sample
- fused CHROM sample
- green/GRGB sample
- candidate SNRs
- region quality summaries
- motion summary
- clipping summary
- candidate agreement
- previous model state if applicable

Possible outputs:

1. **Reconstructed waveform sample**
   The student emits one normalized waveform value per frame. Existing BPM
   estimation then runs on that waveform.

2. **Fusion weights**
   The student emits weights over candidate signals and regions. The runtime
   remains more interpretable.

3. **Waveform plus uncertainty**
   The student emits waveform and confidence. This is useful but should be
   calibrated carefully before apps rely on it.

The first student should probably output fusion weights or a waveform sample
with a separate deterministic quality gate.

### Rust Export Strategy

Start simple:

- Train in Python.
- Export weights as JSON, `.npz`, or another simple artifact.
- Generate a Rust module with static arrays and metadata.
- Implement inference by hand for the small architecture.

Metadata to include:

- model name
- model version
- feature schema version
- training data summary
- normalization constants
- expected sample rate
- expected feature order

Example shape:

```rust
pub struct RppgStudentModel {
    state: StudentState,
}

impl RppgStudentModel {
    pub fn update(&mut self, features: &[f32]) -> StudentOutput {
        // static-weight inference
    }
}
```

Keep ONNX, tract, or candle as later options. A hand-written tiny model is
often easier to ship in WASM than a general ML runtime.

### Quantization

Do not quantize first.

Suggested order:

1. Validate `f32` student accuracy.
2. Measure CPU and bundle size.
3. Try `f16` or int8 only if needed.
4. Re-run validation after quantization.

### Runtime Gating

The learned path should never be the only path.

Use deterministic guards:

- minimum active ROI count
- minimum skin ratio
- maximum clipping
- maximum motion
- minimum candidate agreement
- no severe low-SNR condition

If guards fail:

- fall back to deterministic POS/CHROM fusion
- expose fallback reason
- avoid publishing high-confidence learned outputs

### Phase 4.6 Milestones

1. Build an offline replay format for ROI samples and contact PPG.
2. Add Rust feature extraction for training and runtime parity.
3. Train teacher model on public datasets.
4. Generate teacher labels for distilled training.
5. Train first small causal student.
6. Export static Rust weights.
7. Add WASM inference behind an experimental flag.
8. Validate against deterministic multi-ROI fusion.
9. Enable by default only if it improves held-out validation and runtime cost is
   comfortably below capture/FaceMesh cost.

## Validation Plan

Evaluate deterministic and learned paths separately.

Required splits:

- leave-one-subject-out
- leave-one-dataset-out when datasets permit
- activity-specific splits

Activity buckets:

- rest/steady
- talking
- translation
- rotation
- exercise or elevated motion

Metrics:

- BPM absolute error
- null-window rate
- low-SNR rate
- confidence calibration
- Pearson correlation against contact PPG
- RMSE after alignment
- DTW
- waveform periodicity
- number of confidently wrong estimates

The most important product metric may be fewer bad windows and fewer confidently
wrong estimates, not just a small average BPM improvement.

## Risks And Guardrails

### Dataset Bias

Public datasets are small and uneven across skin tone, camera type, lighting,
and activity. Validation must report per-dataset and per-activity behavior.

### Medical Claims

This work should improve rPPG signal quality. It should not turn the SDK into a
diagnostic medical device or imply clinical-grade vital signs without the proper
validation and regulatory process.

### Privacy

Keep raw video local. Training and replay artifacts should prefer ROI/stat
features over identifiable frames unless explicit consent and storage controls
exist.

### Patent And IP

Avoid copying patent-specific geometry-mask claims from unrelated patents. This
plan is based on public rPPG signal-processing and ML-reconstruction literature,
plus our own runtime architecture. For commercial deployment, run a freedom to
operate review before copying any patented method exactly.

### Runtime Complexity

Every added model path must have:

- deterministic fallback
- versioned feature schema
- diagnostics
- tests
- measurable runtime budget

## Recommended Implementation Order

1. Implement three-region multi-ROI buffers in Rust.
2. Add region quality and diagnostics.
3. Add deterministic POS fusion across regions.
4. Add CHROM and GREEN/GRGB candidate views.
5. Wire TypeScript named ROI sample emission into WASM behind an experimental
   flag.
6. Validate against the existing aggregate pipeline.
7. Expand to 30 landmark patches.
8. Build offline replay/training harness.
9. Train teacher models.
10. Distill and export a tiny student.

This order gives us useful deterministic improvements before taking on ML
runtime complexity.
