# Implementation Plan: Robust Harmonic Selection & User Adaptation for Heart Rate Estimation ✅

**Summary**

This document describes a practical implementation plan to fix the current issue of selecting the wrong harmonic when estimating pulse rate (bpm). The plan covers algorithmic improvements, per-user learning (priors/hierarchical/online adaptation), integration into the repository, testing and evaluation, milestones, and risk mitigation.

---

## Goals 🎯
- Eliminate octave/harmonic errors (e.g., selecting 2× or 0.5× the true HR).
- Learn where each user fits (age/fitness/baseline) and adapt online to reduce repeated errors.
- Provide a robust, testable pipeline that works across platforms (native Rust crate, WASM, mobile demos).

---

## Scope & Assumptions 🔧
- Input: PPG signals (e.g., webcam rPPG pipeline) and optional accelerometer/motion channels. Works for resting and mild activity levels.
- Target ranges: physiologic BPM [30–200], with configurable narrower ranges per-age group.
- Languages/targets: primary implementation in Rust (existing `rppg` / `rppg-ffi` crates), with WASM and example bindings for `packages/rppg-web` and mobile demos.

---

## Approach (High level) 💡
1. Improve candidate selection by combining PSD peak search with complementary checks (cepstrum, autocorrelation, harmonic-sum metric).  
2. Score candidates using features that capture harmonic support, SNR, temporal stability, and waveform morphology.  
3. Use temporal trackers (Kalman / particle) to prefer stable tracks and avoid octave jumps.  
4. Learn per-user priors (hierarchical Bayesian or online updates) to bias candidate selection to realistic user-specific ranges.  
5. Optionally train a small supervised classifier to resolve ambiguous candidates using labeled or semi-labeled data.

---

## Components & Tasks (detailed) 🛠️

### 1) Data & Benchmarks (week 1)
- Task: Gather / curate test datasets: chest-strap ground truth (public datasets), synthetic signals (with controlled harmonics), and in-house webcam rPPG recordings.  
- Deliverable: `data/` manifest and a benchmark script that computes metrics (MAE, bpm error within 1/2/5 bpm, percentage octave errors).

### 2) Baseline & Preprocessing (week 1)
- Implement standardized preprocessing: bandpass filter (0.5–4 Hz), detrending, motion artifact flags, notch filters for mains noise.  
- Unit tests: synthetic signals with noise and motion.

### 3) Candidate Extraction (week 2)
- Code: `rppg/harmonic_detection.rs` (or `rppg/src/harmonic.rs`).  
- Steps: STFT/PSD, peak picking within physiologic range, produce top-N candidates with amplitude, width, and SNR.

### 4) Complementary Checks (week 2)
- Cepstrum-based fundamental detection (que-frency peak => candidate frequency). ✅ *Implemented (see `rppg::harmonic::harmonic_probability_check` and tests).*  
- Autocorrelation/ACF-based period detection.  
- Implement harmonic-sum score: score(f) = sum_{k=1..K} w_k * PSD(k*f) to prefer fundamentals that explain harmonics. ✅ *Implemented (harmonic-sum computed in `dsp::select_harmonic_with_prior`).*

**Exposed metrics:** CEPSTRUM BPM and `cepstrum_confidence` are now included in `RppgMetrics` (accessible from `RppgPipeline::get_metrics()`), enabling demo UIs to visualize cepstrum diagnostics.
**Rust prototype:** a new `crates/rppg/src/harmonic.rs` provides `harmonic_probability_check(samples, fs)` which computes cepstrum BPM, harmonic-sum BPM, and raw PSD peak BPM with unit tests. This advances Phase 1 and provides a quick validation path.

### 5) Scoring & Heuristics (week 3)
- Combine features: {PSD_amp, harmonic_sum, cepstrum_confidence, acf_confidence, SNR, width, temporal_stability}.  
- Create deterministic rule-based ranking and a placeholder for ML-based scoring. ✅ *Basic deterministic scoring implemented: harmonic-sum + SNR and width heuristics added (see `dsp::select_harmonic_with_prior`). Further work: cepstrum/ACF fusion and temporal tracker (next).* 

### 6) Tracking & Temporal Smoothing (week 3)
- Implement a tracker (extended Kalman filter or simple state-space filter) to keep estimated HR stable and penalize sudden octave jumps. ✅ *Draft Particle Filter sketch added (`crates/rppg/src/tracker.rs`) implementing a simple particle filter with predict/update/resample and unit tests.*
- Put thresholds to accept/reject sudden changes and require corroborating evidence across windows.

### 7) Subject Modeling & Priors (week 4)
- Implement subject model: per-user baseline mean + variance. Use hierarchical model offline, and exponential moving average for online adaptation. ✅ *Draft `SubjectModel` added (`crates/rppg/src/subject_model.rs`) with EMA update and `prior_range()` API.*
- Store per-user state (configurable TTL). API: `SubjectModel::update(bpm_reading)` and `SubjectModel::prior_range()`.

**Next:** integrate `ParticleFilter` to accept `SubjectModel::prior_range()` during initialization and wire into `RppgPipeline` as an optional tracker step.
### 8) Supervised Classifier (optional/prio) (weeks 4–6)
- If labeled dataset available, train a small ML model (lightweight logistic / XGBoost / small NN) to pick the correct candidate using the features above.  
- Integrate training pipeline (Python notebook or Rust training script) and serialize model (e.g., ONNX or small JSON rules) for inference.

### 9) Calibration Mode & UX (weeks 5–6)
- Add a calibration flow (30–60s, optional chest strap or short guided session) to quickly adapt priors for a user.  
- Expose API to let apps run calibration and store user profile.

### 10) Cross-platform Integration (weeks 6–8)
- Wire into `rppg` crate; add WASM exports for `packages/rppg-web`.  
- Add Android/IOS demo bindings (update `android-demo` and `ios-demo` as needed).  
- Add sample apps in `eeg-demo` and `packages/rppg-web` to visualize candidate peaks and tracking (good for manual QA).

### 11) Tests, Benchmarks & CI (ongoing)
- Unit tests for each module.  
- E2E tests on recorded sessions (compare to chest strap).  
- Add benchmarks and CI checks.  

---

## Unified Architecture: Neural-Guided Particle Filter (recommended)

This is a practical hybrid approach that combines the fast, cheap DSP methods with Bayesian tracking and optional deep learning corrections. It yields the best real-world accuracy, robustness to motion/lighting, and efficiency on WASM/mobile.

| Your Plan Step | Role in Hybrid System | Recommendation for Combination |
| --- | --- | --- |
| **3. Candidate Extraction** | **The "Sensor"** | **Keep as is (DSP).** Lightweight 30Hz loop producing candidates via STFT/PSD. |
| **4. Complementary Checks** | **The "Validator"** | **Crucial.** Cepstrum and Harmonic-Sum are cheap mathematical validators and should be implemented first. |
| **6. Tracking / Smoothing** | **The "Filter"** | **Upgrade.** Implement a Particle Filter which naturally maintains multiple hypotheses and integrates prior/state updates. |
| **7. Subject Modeling** | **The "Prior"** | **Key Integration Point.** The SubjectModel stores per-user priors (resting/active distribution) that bias the tracker. |
| **8. Supervised Classifier** | **The "Expert"** | **Replace with Deep Learning.** Integrate a quantized DeepPhys/PhysNet model for intermittent corrections (e.g., 0.5Hz). |

### Why combine them?

- Cold start: DSP provides instant feedback; priors and the Particle Filter stabilize quickly; the Deep model refines accuracy after a few seconds.
- Battery/performance: DSP runs at 30Hz, Deep model at 0.5–1Hz for corrections.
- Robustness: math + prior + neural corrections create a "Swiss cheese" defense against harmonic errors.

### Modified Roadmap (execute as phases)

**Phase 1: The "Math" Defense (Weeks 1–3)**
- Implement Steps 3, 4 & 5 (Candidate Extraction, Cepstrum, Harmonic-Sum, basic scoring). Goal: achieve ~80% reduction in harmonic errors.

**Phase 2: The "Bayesian" Defense (Weeks 4–5)**
- Implement Step 6 (Particle Filter-based Tracker) & Step 7 (SubjectModel). ✅ *Particle Filter integrated into `RppgPipeline` (optional via `enable_tracker`) and accepts multiple weighted candidates to update belief. Unit tests demonstrate resistance to octave flips.*

**Phase 3: The "Neural" Defense (Weeks 6+)**
- Integrate a quantized DeepPhys model (ONNX/onnxruntime-web for WASM or TFLite/CoreML for mobile) to provide high-confidence corrections and update priors when needed.

### Specific Notes & Recommendations

- Prioritize Cepstrum (Step 4): it is extremely effective at separating pitch from timbre and should be implemented early.
- SubjectModel: start simple (GMM with 2 states or EMA online adaptation). Keep storage and TTL configurable.
- ML Model: delay heavy model training/integration until the math+Bayesian pipeline proves necessary in the wild.

### Short-term fixes to mitigate octave flips (applied)

These are quick, low-risk changes that reduce octave/double errors and improve stability in the field. They are implemented in the `rppg` crate and can be tuned via unit tests and logs.

1. Stronger cepstrum overrides ✅
   - Accept cepstrum override at **cep_conf >= 0.50** if cepstrum BPM is within the prior range.
   - Accept moderate cepstrum (cep_conf >= 0.40) if there is **harmonic support** in the PSD candidates.
2. Harmonic-consistency check ✅
   - For any cepstrum BPM, compute harmonic-support from the top-N PSD candidates (match at 1×, 0.5×, 2× within ~8% relative tolerance). Boost a candidate's score if it aligns.
3. Dynamic pending-confirmation for large jumps ✅
   - For large jumps (abs > 10 bpm or relative > 12%), require extra consecutive confirmations (+2 windows) before committing.
4. Stronger tracker prior influence ✅
   - Amplify the subject prior in the ParticleFilter (configurable weight; default increased) and slightly reduce process noise to improve inertia and resist octave-dominant transient windows.
5. Ensemble scoring (short-term tuning) ✅
   - Use a combined score: w_cep * cep_conf + w_harmonic * harmonic_support + w_acf * acf_score + w_snr * snr. Default trial weights: cep 0.50, harmonic 0.30, acf 0.10, snr 0.10.

These fixes were implemented as part of the current sprint and are available for tuning. See `crates/rppg/src/pipeline.rs` and `crates/rppg/src/tracker.rs` for the implementation details.

---

**Next suggested step:** Add a Rust `SubjectModel` struct and a tracker interface (Particle Filter sketch), then wire basic unit tests to demonstrate integration. ✅

---

## Evaluation Metrics & Acceptance Criteria ✅
- Mean absolute error (MAE) vs ground truth ≤ 2 bpm on resting data.  
- Octave/harmonic error rate ≤ 1% on evaluation set.  
- Robustness to motion: graceful performance drop (define acceptable bounds).  
- Prior predictive checks show realistic draws for various user profiles.

---

## Timeline & Milestones (high level)
- Week 1: Data collection, baselines, preprocessing.  
- Week 2: Candidate extraction + cepstrum/autocorr checks.  
- Week 3: Scoring + tracker + simple heuristics.  
- Week 4: Subject modeling & online adaptation.  
- Weeks 5–6: Supervised classifier (if chosen) + calibration UX.  
- Weeks 6–8: Integration into WASM/mobile demos + testing & CI.  
- Buffer & polish: 1–2 weeks.

Estimated total: 6–10 weeks depending on scope (supervised model, labeling needs, and cross-platform polish).

---

## Risks & Mitigations ⚠️
- Risk: Lack of labeled ground truth for supervised training → Mitigation: use synthetic signals, public datasets, and active collection.  
- Risk: Overfitting to office lighting or device-specific artifacts → Mitigation: augment dataset and use domain randomization.  
- Risk: Real-time constraints on mobile → Mitigation: profile and optimize; implement low-cost heuristics first and optional ML later.

---

## Deliverables 📦
- `rppg` Rust modules: harmonic detection, tracker, subject model.  
- WASM exports + web demo visualization. ✅ *rppg web demo now visualizes cepstrum BPM and confidence (packages/rppg-web/demo/index.html).*  
- Calibration UX & per-user profile storage.  
- Unit & E2E tests and benchmark scripts.  
- Implementation and API documentation in `docs/` and demo READMEs.

---

## Next immediate steps (choose one) ➡️
1. Create a GitHub issue and break the plan into triaged tickets (data, extraction, scoring, tracker, subject model, integration).  
2. Prototype harmonic-sum + cepstrum checks in a short Python notebook using a small dataset (faster iteration).  
3. Start implementing `rppg/harmonic_detection.rs` with unit tests for synthetic signals.

> Suggested first action: create the issue list and a small prototype notebook to validate harmonic-sum + cepstrum checks within 3 days.

---

If you'd like, I can also:  
- Draft the GitHub issue list & titles,  
- Produce a starter Python notebook or Rust prototype for the candidate/cepstrum pipeline, or  
- Open the first PR that implements `rppg/harmonic_detection.rs` with tests.  
 
Which next step do you prefer? 🔧

## Continued Workstreams (Phase 4+)

### 12) Observability & Telemetry (week 6)
- Surface structured metrics from `RppgPipeline` (per-window bpm, confidence scores, tracker entropy, cepstrum/ACF confidences) and expose them via WASM bindings or callbacks so the demo apps can log regressions.
- Add a lightweight diagnostics mode (`RppgPipeline::set_diagnostics(true)`) that emits per-window metadata (candidate scores, tracker weights) to help tune priors.
- Instrument the demo apps to layer live charts over these metrics and record logs for offline review.

### 13) Platform Demos & UX polishing (week 6–7)
- Update `packages/rppg-web/demo/index.html` and `eeg-demo` to visualize candidate peaks, tracker history, and cepstrum diagnostics (bpm vs harmonic support with color-coded confidence).
- Add a simple onboarding/calibration flow (30s guided breathing) to capture resting priors and provide feedback when the tracker is uncertain.
- Add dataset playback tooling (CSV or WAV replay) into the demos so partners can reproduce harmonic errors and validate fixes quickly.

### 14) Release Integration & Packaging (week 7–8)
- Harden the `run.sh` script with sanity checks for `wasm-bindgen` and add `ci/build.sh` that mirrors the release pipeline for CI.
- Publish new `eeg-wasm` bindings into `packages/rppg-web` and `eeg-demo` after each release cycle; ensure versioned artifacts are captured and documented (e.g., `eeg-demo/pkg` should reflect the embedded `rppg` release).
- Document the new APIs and workflows in `docs/` (sections covering `RppgMetrics`, tracker configuration, and subject priors).

### 15) Validation & Continuous Improvement (ongoing)
- Maintain a benchmark suite that runs the new metrics on a mix of synthetic and real recordings, reporting MAE/octave error for every merge.
- Use per-window logging to compute how often cepstrum overrides, tracker smoothing, or priors are the deciding factor and keep those heuristics balanced.
- Allocate time each sprint for `cargo clippy`/`cargo fmt` hygiene so the codebase stays maintainable as diagnostics code grows.

## Next follow-up options

1. Generate the backlog and epics for Phase 4+ (observability, demo UX, packaging) so the team knows which issues to pick next.  
2. Prototype the telemetry mode and demo visualizations in `packages/rppg-web/demo/index.html`, showing realtime harmonic scores and tracker weight arrows.  
3. Build the benchmark suite that runs the new metrics in CI and exports a reproducible report for each release.

Let me know which direction to take next or if you’d like me to knock out one of those follow-ups now.
