# Phase 0 Metric Sheet

Status: Active

## Purpose

This metric sheet defines what must be measured during the first stages of the cross-modal biosignals program and how results should be interpreted.

## Metric groups

### 1. Preprocessing distortion

These metrics are mandatory before a preprocessing step becomes part of the default path.

| Metric | Applies to | Why it matters | Report requirement |
| --- | --- | --- | --- |
| Group delay curve | notch, bandpass, resampling | quantifies phase distortion and latency | report by frequency and path |
| Frequency attenuation curve | notch, bandpass, resampling | shows what content is removed | report by frequency and path |
| Synthetic transient reconstruction error | all preprocessing paths | checks whether fast events survive | report on canonical burst and pulse templates |
| Rise-time error | EEG and PPG event paths | checks transient blunting | report absolute and relative error |
| Waveform-shape error | PPG morphology path | checks pulse morphology preservation | report on beat-aligned templates |
| CPU wall-clock cost | all preprocessing paths | protects toy-mode iteration | report on laptop CPU |
| GPU wall-clock cost | learned denoiser path if used | quantifies scale cost | report on workstation GPU |

### 2. Data quality

| Metric | Level | Why it matters | Report requirement |
| --- | --- | --- | --- |
| Sensor dropout fraction | window, session | identifies unusable segments | always report |
| Clipping fraction | window, session | identifies saturation | always report |
| Motion artifact score | window, session | predicts model brittleness | always report |
| Line-noise residual | window, session | validates denoising | always report |
| Synchronization confidence | window, session | validates cross-modal pairing | always report |
| Event detectability score | window | checks event visibility in EEG and PPG | report when event paths are used |

### 3. Shared latent space

| Metric | Why it matters | Report requirement |
| --- | --- | --- |
| Cross-modal retrieval accuracy | tests alignment quality | always report |
| Linear-probe transfer performance | tests task content in embeddings | always report |
| Subject leakage score | checks whether identity dominates | always report |
| Event decoding accuracy from bottleneck | checks event content in latent space | report when labels or pseudo-labels exist |
| Latent direction stability | tests morphology-specific directions | report for every checkpoint family |
| Intervention score after latent ablation | tests causal interpretability | report for every checkpoint family |

### 4. EEG -> fNIRS

| Metric | Why it matters | Report requirement |
| --- | --- | --- |
| Pearson or Spearman correlation | basic reconstruction quality | always report |
| Lag-aware correlation | respects hemodynamic delay | always report |
| Low-frequency spectral error | tracks trend preservation | always report |
| HbO and HbR trend accuracy | captures regional trajectory quality | always report |
| Event retention error | checks whether events survive translation | report when event labels or pseudo-labels exist |
| Downstream-task delta | tells whether inferred fNIRS is useful | always report when a downstream task is defined |

### 5. EEG or EEG + fNIRS -> PPG

| Metric | Why it matters | Report requirement |
| --- | --- | --- |
| Beat-timing error | event alignment | always report once beat targets exist |
| Rising-edge slope error | morphology preservation | always report once slope targets exist |
| Dicrotic-notch timing error | morphology preservation | always report once notch targets exist |
| Pulse width and amplitude error | morphology preservation | always report once targets exist |
| HR MAE | state-level sanity check | report once state targets are used |
| HRV feature error | state-level sanity check | report once state targets are used |
| Embedding similarity | latent prediction quality | always report when embedding targets are used |

### 6. Shift and robustness

| Metric | Why it matters | Report requirement |
| --- | --- | --- |
| Error by age band | detects cohort shift | report when metadata exists |
| Error by caffeine or nicotine bucket | detects physiology shift | report when metadata exists |
| Error by recent exercise bucket | detects state shift | report when metadata exists |
| Error by artifact burden bucket | detects robustness limits | always report |
| Calibration by in-distribution vs shifted slices | checks confidence honesty | always report once confidence is exposed |

### 7. Toy mode and runtime

| Metric | Why it matters | Report requirement |
| --- | --- | --- |
| End-to-end toy run time | protects iteration speed | always report for toy runs |
| Peak memory use | protects laptop execution | always report for toy runs |
| Dataset subset size | makes runs comparable | always report for toy runs |
| Single-command success | enforces low friction | binary pass-fail |

## Metric reporting policy

Every experiment report should clearly separate:

- required metrics for the current phase
- optional metrics not yet applicable
- missing metrics because labels or metadata do not yet exist

Missing metrics should never be silently omitted.
