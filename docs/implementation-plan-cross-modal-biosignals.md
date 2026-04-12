# Cross-Modal Biosignal Model Implementation Plan (v2)

Status: Active plan (v2, revised after feedback, annotated with execution status through April 6, 2026)

## Summary

This document describes a step-by-step implementation plan for building a small-data, cross-modal biosignal modeling program around Athena recordings with EEG, fNIRS, and PPG.

This v2 updates the original plan in seven important ways:

- prototype-first execution is now a hard requirement
- PPG is treated as an event-bearing signal, not only a slow state signal
- preprocessing now has an explicit distortion budget and benchmark plan
- Haar wavelet views are preferred over default STFT summaries for event-bearing signals
- latent-space usefulness now has explicit interpretability tests
- data quality and distribution shift are first-class evaluation targets
- channel geometry is preserved explicitly in the tokenization and ablation plan

The goal is not to train a giant tri-modal "foundation model" from scratch. The goal is to build an internal representation model that:

- learns reusable embeddings across modalities
- predicts a missing modality from one or two observed modalities
- improves downstream tasks when one sensor is missing or noisy
- scales as more internal data arrives without forcing a restart

The recommended execution order is:

1. Build clean data, synchronization, and quality-control infrastructure.
2. Use EEG <-> fNIRS as the infrastructure reference path, but treat EEG-PPG as the immediate business-priority execution target.
3. Preserve event-level structure early, especially in EEG and PPG, using minimal-distortion preprocessing and wavelet-friendly derived views.
4. For EEG-PPG, start with PPG as an event and morphology target first, then layer state targets on top.
5. Move to tri-modal missing-modality inference only after the paired latent space is stable.
6. Treat raw waveform generation as a later capability, not the first milestone, but do not destroy waveform structure during preprocessing.

---

## Execution Status

As of April 6, 2026, the repo is no longer at the pure-planning stage.

Completed or materially implemented:

- Phase 0 framing artifacts exist, including the research charter, metric sheet, reproducibility checklist, and toy-mode contract.
- Phase 0A local prototype path exists and runs end to end on a laptop-scale synthetic task.
- Phase 1 intake is substantially complete for `DS004514`, including source-backed manifest work, ingest notes, split and normalization notes, and raw waveform smoke paths.
- Phase 1 intake is now also source-backed for `DS003838`, including the worksheet, ingest note, and intake report for the first EEG-PPG public reference dataset.
- Phase 1 intake is now also source-backed for `DS006848`, including the worksheet, ingest note, and intake report for the second EEG-PPG public benchmark candidate.
- Phase 1 intake for `DS003838` now also includes a pilot split plan and the first executable EEG-PPG Phase 2 note.
- Phase 1 intake for `DS006848` now also includes a pilot split plan, an executable EEG-PPG Phase 2 note, and dataset-specific target and baseline notes.
- Phase 2 has a real `DS004514` pilot artifact, not just a proposal:
  - canonicalized paired EEG-fNIRS dataset
  - dual-view EEG window dataset
  - per-window quality flags
  - first preprocessing distortion ledger entry
- Phase 2 now also has a real `DS003838` EEG-PPG pilot artifact:
  - direct EEGLAB/HDF5 read path for EEG and cardiovascular `.set` payloads
  - dual-view EEG windows plus dual-view PPG windows
  - per-window PPG morphology-quality metadata
  - second preprocessing distortion ledger entry, now including a cleaned PPG path
  - the default pilot split has been expanded to 4 subjects and 2048 paired windows
  - a first explicit PPG target artifact now exists on top of that pilot split, with target-validity masks and coverage reporting
  - an expanded development split now exists with 8 subjects and 4096 paired windows
- Phase 2 now also has a real `DS006848` EEG-PPG path:
  - direct BrainVision read path for shared EEG, PPG, and ECG recordings
  - dual-view EEG windows plus dual-view PPG windows
  - per-window event-family and morphology-quality metadata
  - third preprocessing distortion ledger entry, now using a source-matched `50 Hz` notch
  - a first verbalwm smoke split now exists with `sub-001` train, `sub-007` eval, and `512` paired quality-pass windows
  - a first DS006848 target artifact now exists on top of that pilot split, with `508` dominant-beat-valid windows and train-only notch coverage
  - an expanded verbalwm development split now exists with `sub-001`, `sub-010` train and `sub-007`, `sub-012` eval, with `1024` paired quality-pass windows
  - an expanded target artifact now exists on top of that development split, with `1020` dominant-beat-valid windows and notch coverage still entirely concentrated in train
  - a broader verbalwm development split now exists with `sub-001`, `sub-010`, `sub-013`, `sub-015` train and `sub-007`, `sub-012`, `sub-016`, `sub-017` eval, with `2048` paired windows and `1983` quality-pass windows
  - a broader target artifact now exists on top of that split, with `1978` dominant-beat-valid windows and the first nonzero DS006848 eval notch coverage (`123` valid windows)
  - a first rest pilot now exists with `sub-001` train and `sub-007` eval, with `20` paired windows, `20` quality-pass windows, and zero measured alignment residual
  - a first rest target artifact now exists on top of that pilot, with `10 / 10` dominant-beat-valid windows in both train and eval, and train-only notch coverage (`2` valid windows)
  - a machine-readable DS006848 verbalwm subject-quality policy now exists for the reviewed broader cohort:
    - `sub-016` is `stress_test_only`
    - `sub-017` is `borderline_review`
    - the remaining verbalwm subjects stay `pending_review`
  - a broader `12`-subject DS006848 verbalwm waveform-quality review now exists:
    - `1536` sampled windows
    - `1509` quality-pass windows
    - `1526` dominant-beat-valid windows
    - `131` notch-valid windows
    - strongest current pending-review promotion candidates: `sub-002`, `sub-035`
    - weakest reviewed cases remain `sub-016`, `sub-017`, and `sub-025`
- Phase 3 has only a preview implementation so far:
  - routed and canonicalized negative-control baselines exist for `DS004514`
  - these are useful for de-risking, but they are not yet the serious baseline suite the plan calls for
  - `DS003838` now has the first EEG-PPG pilot baseline preview:
    - ridge baselines over `eeg_event` and `eeg_clean` branches
    - aggregate standardized error beats null on the 4-subject pilot split after retuning regularization
    - pulse amplitude range, rising-edge slope, and dominant-beat amplitude beat null on MSE
    - mean inter-beat interval does not yet beat null
    - dominant-beat rise time and width do not yet beat null
  - `DS003838` now also has the first broader development check:
    - the 8-subject split stays clean at the data and alignment level
    - the simple ridge baseline no longer beats null on aggregate standardized MSE
    - a ridge sweep from `100` through `100,000,000` does not recover an aggregate win for either branch
    - failure analysis now shows:
      - `eeg_clean` is the least-bad branch
      - the remaining positive signal is amplitude-heavy, not timing-heavy
      - the failure is not explained by target sparsity for the dominant-beat family
      - the highest `ppg_clean_std` quartile is the only eval-quality slice that is slightly better than null
  - `DS006848` now also has both a first positive-check baseline and a broader follow-up:
    - the 4-subject verbalwm split stays clean at the data, alignment, and target-coverage levels
    - both `eeg_event` and `eeg_clean` beat the null on aggregate standardized MSE
    - `eeg_event` is currently the best branch
    - the current gain is concentrated in amplitude-style targets, especially `amplitude_range` and `dominant_beat_amplitude`
    - the first slice-analysis pass now shows:
      - the aggregate win is asymmetric across eval subjects
      - `sub-012` carries most of the current amplitude-family gain
      - timing-family targets still underperform
      - the lower two `ppg_clean_std` eval quartiles remain worse than null
    - the broader 8-subject verbalwm split no longer beats the null on aggregate standardized MSE for either branch
    - `eeg_clean` becomes the least-bad branch on that broader split
    - the broader slice-analysis pass now shows:
      - `sub-016` is the dominant failure case by a wide margin
      - `sub-017` also underperforms, though less severely
      - all peak-count and `ppg_clean_std` quartile slices are worse than null
      - the failure is still concentrated most heavily in amplitude-family targets
    - the first model-aware cohort-swap experiment now also exists:
      - it keeps the reviewed train cohort fixed
      - it replaces eval `sub-016` and `sub-017` with pending-review shortlist subjects `sub-002` and `sub-035`
      - the swapped split stays fully clean at the data layer with `2048 / 2048` quality-pass windows
      - dominant-beat coverage stays dense with `1020` eval-valid windows
      - `eeg_clean` remains the least-bad branch
      - the aggregate standardized delta drops sharply from the broader split, but the branch still does not beat null
      - `mean_ibi_seconds` now beats null on MSE for `eeg_clean`, while amplitude-family targets remain the main blocker
      - the remaining problem now looks more like target-scale and amplitude-shift mismatch than a single catastrophic-subject failure
    - the next calibration-aware follow-ups now also exist on that same cohort-swap split:
      - a shift-aware subject-zscore baseline exists
      - `oracle_subject_zscore` still does not beat null
      - `calibrated_subject_zscore` on `eeg_clean` edges past null on aggregate MSE
      - `amplitude_range` and `rising_edge_slope_max` are the first targets to recover in subject-normalized space
      - a calibrated absolute-unit baseline now also exists
      - `calibrated_absolute` on `eeg_clean` beats null on aggregate relative MSE:
        - aggregate relative MSE is about `0.9238`
        - zero-shot best-branch aggregate relative MSE is about `1.6494`
      - the first targets to recover in real units are:
        - `amplitude_range`
        - `rising_edge_slope_max`
        - `dominant_beat_rise_time_seconds`
      - this is the first broader DS006848-style null-beating result in real target units, but it is still a subject-calibrated result, not a zero-shot claim
    - the first one-subject calibrated cohort expansion now also exists:
      - it adds `sub-011` to the cohort-swap eval side
      - the data path stays fully clean with `2304 / 2304` quality-pass windows
      - dominant-beat coverage stays dense with `1274` eval-valid windows
      - the full calibrated-absolute morphology result no longer beats null:
        - full aggregate relative MSE rises to about `2.1957`
      - the family comparison now shows:
        - amplitude-family aggregate relative MSE stays below null at about `0.9017`
        - timing-family aggregate relative MSE collapses to about `4.1367`
      - `sub-011` is the dominant new timing-family failure, so it should not yet be promoted into the default full-morphology calibrated cohort
    - the dedicated amplitude-family calibrated benchmark now also exists:
      - it uses `amplitude_range`, `rising_edge_slope_max`, and `dominant_beat_amplitude`
      - it remains null-beating on the cohort-swap split:
        - aggregate relative MSE is about `0.8743`
      - it also remains null-beating after adding `sub-011`:
        - aggregate relative MSE is about `0.9017`
      - it also remains null-beating after adding the weak-amplitude `sub-025` stress-test subject:
        - aggregate relative MSE is about `0.8753`
      - `sub-025` should still stay pending for the default full-morphology cohort, but it no longer breaks the narrowed amplitude-family path
      - this is now the first DS006848 benchmark that survives two cautious subject expansions
    - the first slightly richer amplitude-only model comparison now also exists:
      - a calibrated median-heuristic RBF-kernel ridge baseline was tested on the fixed cohort-swap benchmark and the `sub-025` stress test
      - it does not beat the calibrated linear amplitude benchmark on either run
      - both RBF runs stay near null:
        - cohort-swap aggregate relative MSE is about `0.9986`
        - cohort-plus-sub025 aggregate relative MSE is about `0.9986`
      - the DS006848 amplitude benchmark should therefore remain anchored to the calibrated linear baseline, not generic kernelized nonlinearity
    - the first low-rank amplitude follow-on now also exists:
      - a calibrated low-rank linear sweep was run with ranks `8, 16, 32, 64, 128, 256, 512`
      - the best candidate is `eeg_clean_windows` at rank `64`
      - it improves over the full-resolution calibrated linear baseline on both accepted amplitude cohorts:
        - cohort-swap aggregate relative MSE improves from about `0.8743` to about `0.8680`
        - cohort-plus-sub025 aggregate relative MSE improves from about `0.8753` to about `0.8691`
      - the active DS006848 amplitude benchmark should now move to the low-rank rank-64 `eeg_clean` baseline
    - the first subject-conditioned residual follow-on now also exists:
      - it kept the same low-rank rank-64 `eeg_clean` branch and added a per-subject residual-bias correction after the short calibration step
      - it fails on both accepted amplitude cohorts and degrades every tracked target
      - cohort-swap aggregate relative MSE worsens from about `0.8680` to about `1.3670`
      - cohort-plus-sub025 aggregate relative MSE worsens from about `0.8691` to about `1.3674`
      - the next DS006848 follow-on should therefore move away from subject-bias correction and toward better event-aligned EEG feature views

Still incomplete:

- Phase 2 for `DS006848` now covers development-scale verbalwm plus a first rest target-complete smoke branch, but it is still incomplete at the dataset level because the long-term role of the rest branch is still undecided.
- Phase 2 is still development-scale for EEG-PPG. `DS003838` now has a 4-subject smoke artifact, an 8-subject development artifact, and target-coverage layers for both, but not yet a broader paired-cohort default artifact.
- Athena internal intake and preprocessing are still incomplete.
- There is still no broad-cohort zero-shot EEG-PPG positive baseline result; the earlier DS006848 4-subject positive check does not survive the broader 8-subject follow-up.
- There is still no stable wider-cohort full-morphology calibrated EEG-PPG result; the first positive calibrated path survives on the cohort-swap split but not after adding `sub-011`.
- The narrower amplitude-family calibrated benchmark is now stable under two cautious subject expansions, but it is still only a calibrated benchmark, not a zero-shot claim and not a full-morphology result.

Operational interpretation:

- `DS004514` should still be treated as the completed reference path for ingest, synchronization, windowing, and distortion benchmarking.
- `DS003838` should now be treated as the harder EEG-PPG stress-test and negative-check path.
- `DS006848` should now be treated as the cleaner EEG-PPG reference path for intake, synchronization, future rest-branch work, and amplitude-first subject-calibrated EEG-PPG development.
- The next execution track should stay on EEG-PPG rather than extending EEG-fNIRS research depth immediately.

---

## Why this plan

### What is realistic

- Small-data biosignal modeling can work when the model is heavily biased by preprocessing, pretraining, and task design.
- Reusable modality encoders are more realistic than training one end-to-end model from scratch.
- Shared latent alignment can work with far less paired data than direct raw-signal generation.
- Repeated sessions on a small number of people are often more valuable than a one-shot recording from many people.
- Laptop-scale or single-workstation prototype loops are realistic and should be the default starting point.

### What is not realistic

- A true public-scale biosignal foundation model trained only on internal tri-paired Athena data.
- Raw EEG -> PPG waveform generation as the first project milestone.
- Claiming broad modality translation unless the model generalizes across subjects, sessions, and protocols.

### Recommended first target

Original scientific recommendation:

- start with EEG -> fNIRS and EEG <-> fNIRS latent alignment

Reasoning:

- EEG and fNIRS are linked by neurovascular coupling.
- There is published evidence that EEG-informed fNIRS prediction is feasible in limited-data settings.
- The latency structure is known and can be modeled explicitly.

Current execution note as of March 23, 2026:

- the immediate business-priority target is now EEG-PPG, not EEG-fNIRS
- the repo already has enough EEG-fNIRS implementation to use `DS004514` as the reference Phase 1 and Phase 2 path
- this means the next incremental engineering work should move to EEG-PPG intake, preprocessing, and baseline modeling instead of deepening the EEG-fNIRS branch first

- PPG is still useful, but v2 treats it as both an event-bearing waveform and a state signal. Morphology, dicrotic notch timing, and rising-edge slope should be preserved even if raw PPG reconstruction is not the first cross-modal milestone.

---

## Immediate Next Steps

Given the EEG-PPG pivot, the recommended near-term sequence is:

1. Treat the DS006848 amplitude-family calibrated benchmark as the active EEG-PPG development path.
   Keep the cohort-swap full-morphology calibrated path as the harder secondary benchmark, the broader reviewed split as the stress test, the 2-subject verbalwm path as the smoke contract, and the earlier 4-subject result as historical only.

2. Stop treating the current EEG-PPG branch as a zero-shot modeling problem.
   The strongest current result is now subject-calibrated, not zero-shot.

3. Treat the `DS003838` failure analysis as complete enough to change priorities.
   Current evidence now says:
   - the 4-subject pilot win is real at pilot scope, but not stable enough yet
   - dominant-beat coverage remains strong on the 8-subject split, so the problem is not target sparsity for the main morphology family
   - `eeg_clean` remains the default source branch
   - the surviving positive signal is concentrated in amplitude-style targets
   - the current simple baseline is not robust enough under mild subject expansion

4. Use the explicit DS006848 verbalwm subject-quality policy plus the cohort-swap shortlist as the current cohort gate.
   The current DS006848 reading now says:
   - `sub-016` is `stress_test_only`
   - `sub-017` is `borderline_review`
   - `sub-002` and `sub-035` are the strongest current promotion candidates
   - `sub-011` should stay `pending_review` for the full-morphology calibrated path
   - `sub-025` should stay `pending_review` for the full-morphology calibrated path even though it now passes the narrower amplitude-family stress test
   - the remaining verbalwm subjects stay `pending_review` until a calibrated follow-up justifies promotion

5. Treat the current 2-subject DS006848 rest path as a target-complete smoke contract, not a benchmark yet.
   The first rest branch now has:
   - `20` paired windows
   - `20 / 20` quality-pass windows
   - `10 / 10` dominant-beat-valid windows in both train and eval
   - train-only notch coverage (`2` valid windows)

6. Treat the broader DS006848 waveform-quality pass and the first cohort-swap run as completed evidence, not open questions.
   Current evidence now says:
   - strongest pending-review promotion candidates: `sub-002`, `sub-035`
   - verbalwm-only secondary candidate: `sub-011`
   - keep `sub-025` pending for full morphology, but no longer as a blocker for the narrowed amplitude benchmark
   - keep `sub-016` as `stress_test_only`
   - keep `sub-017` as `borderline_review`

7. Treat the cohort-swap result as a real calibrated recovery, but not a zero-shot recovery.
   Replacing `sub-016` and `sub-017` with `sub-002` and `sub-035` removes the catastrophic failure mode and restores a fully clean eval cohort. On top of that split, short subject calibration now produces the first broader DS006848-style null-beating result in real units.

8. Use the amplitude-family calibrated benchmark as the active DS006848 benchmark before widening the full morphology cohort again.
   The `sub-011` and `sub-025` expansions show that amplitude-family behavior stays below null under both a timing-heavy and a weak-amplitude stress test. The first generic nonlinear comparison shows that naive RBF kernelization does not help, the first low-rank comparison shows that rank-64 `eeg_clean` does help modestly and consistently, and the first subject-conditioned residual follow-on shows that simple residual-bias correction is actively harmful on both accepted amplitude cohorts. The next experiment should therefore hold this cohort fixed and compare better event-aligned EEG feature views, preferably cheap wavelet-style or other transient-aware views, against that low-rank baseline.

9. Keep the rest branch in smoke-contract mode until the calibrated verbalwm path is stable.
   Do not treat the current 2-subject rest path as a modeling benchmark yet.

10. Treat raw EEG -> raw PPG waveform generation and deeper architectures as explicitly out of scope until either the amplitude-family calibrated path is stable under wider cohort expansion or the full calibrated morphology path survives the next cohort expansion.

This is the shortest path from current repo state to the new business goal.

---

## Program goals

### Primary goals

- Build a reusable latent space for EEG, fNIRS, and PPG.
- Support missing-modality inference for internal research and product experiments.
- Demonstrate that inferred modalities improve downstream tasks relative to source-only baselines.
- Establish a research and engineering pipeline that can absorb more internal Athena data over time.
- Keep small-scale experimentation fast enough to run on a laptop or personal workstation from the first week.

### Secondary goals

- Create a path to lightweight inference for demos or future SDK integration.
- Build a calibration flow for subject-specific adaptation.
- Produce a publishable internal benchmark for Athena multimodal modeling.

### Non-goals for v1

- No clinical claims.
- No end-to-end giant model trained from scratch on Athena alone.
- No attempt to synthesize perfectly realistic raw signals for all three modalities at once.
- No productization into the shipping SDK until the research pipeline proves value.
- No preprocessing stack that destroys event-level structure before the model sees the data.

---

## Guiding principles

1. Pretrain broadly, align narrowly.
   Use public unimodal and bimodal data to learn robust encoders, then use Athena data for alignment and adaptation.

2. Learn representations before generation.
   If embeddings do not align across modalities, decoders will not save the project.

3. Respect physiology.
   Use known lags, sampling-rate differences, and noise models instead of pretending all modalities are interchangeable.

4. Optimize for held-out subjects, not in-sample reconstruction.
   A pretty reconstruction that fails leave-one-subject-out validation is not useful.

5. Favor repeated sessions over more people with shallow coverage when collection is limited.
   Session diversity exposes state changes and improves robustness.

6. Keep the runtime small.
   Start with compact adapters, projection heads, and small decoders. Freeze most pretrained encoder weights at first.

7. Design for local iteration before scale.
   Every major phase must have a CPU or single-GPU toy path that runs on a tiny dataset subset.

8. Preserve fast events unless there is measured evidence that a preprocessing step is harmless.
   The burden of proof is on the filter, not on the event.

9. Treat geometry as signal, not metadata.
   EEG electrode layout and fNIRS optode geometry should be preserved explicitly in the model inputs.

---

## Success criteria

The project should be considered successful only if most of the following are true:

- The model aligns paired EEG and fNIRS windows well enough to support cross-modal retrieval above simple baselines.
- EEG -> fNIRS prediction beats lagged linear baselines on held-out subjects.
- Adding inferred fNIRS or inferred PPG features improves at least one downstream task versus source-only input.
- The model remains stable under leave-one-subject-out and leave-one-session-out evaluation.
- Subject leakage is controlled and can be measured.
- The pipeline can be retrained as new Athena data arrives without major redesign.
- A researcher can run a toy experiment end-to-end on a laptop or personal workstation without building the full production data stack.
- Event information is recoverable from the latent space, not just from the raw inputs.
- Reconstruction quality is reported as a function of distribution shift, not only average accuracy.

Representation-level success tests:

- decode at least one annotated event type from the bottleneck vector with a simple probe
- identify latent directions associated with specific waveform morphologies
- ablate a latent direction and observe a specific event type weaken or disappear in the reconstruction

Suggested initial go/no-go gates:

- Gate 1: preprocessing and synchronization produce stable windows with trustworthy timestamps and quality masks.
- Gate 2: preprocessing distortion is measured and documented for each filter path before training begins.
- Gate 3: lagged linear EEG -> fNIRS baselines beat a null baseline on held-out sessions.
- Gate 4: shared latent alignment improves cross-modal retrieval and downstream transfer over unimodal baselines.
- Gate 5: a lightweight translation head beats linear and TCN baselines before any larger generative model is attempted.
- Gate 6: prototype configs run locally in a short feedback loop.

---

## Working assumptions

- Athena provides synchronized or near-synchronized EEG, fNIRS, and PPG streams.
- Internal tri-paired data volume is small, likely far below what would justify from-scratch pretraining.
- Public EEG data is easier to obtain at scale than public paired EEG-fNIRS or EEG-PPG data.
- There is no mature, dominant open fNIRS foundation model to rely on today, so a custom fNIRS encoder will likely be necessary.
- Internal research can use Python-based training even if the shipping SDK remains Rust and TypeScript focused.
- Event-level annotations will be sparse, so the plan must work with weak labels, pseudo-labels, and analyst-reviewed event subsets.

---

## Recommended system architecture

### 1. Canonical multimodal sample representation

Every recording should be converted into a single canonical training object with:

- subject ID
- session ID
- task or protocol label
- exact start and stop time
- per-modality timestamps
- per-modality sample rates
- channel metadata and geometry
- per-window quality flags
- preprocessing provenance

Recommended storage format:

- BIDS-like metadata for EEG and fNIRS
- SNIRF where possible for fNIRS raw or processed records
- Parquet, Arrow, or Zarr for training-ready windows and metadata manifests

Do not let raw ad hoc CSV exports become the research source of truth.

### 2. Modality-specific preprocessing

Preprocessing is no longer a silent setup detail. In v2 it has its own distortion budget, benchmark scripts, and acceptance criteria.

Use a dual-view policy for event-bearing signals:

- preserve one minimally processed path for event structure
- preserve one cleaned path for robust baseline modeling
- optionally learn a denoised residual or denoised view rather than forcing all signal cleanup into fixed filters

### EEG

Required steps:

- remove or flag flat channels and severe dropouts
- choose a consistent reference strategy
- compute per-window quality indicators
- keep a minimally processed event-preserving stream
- keep a cleaned comparison stream for baseline and ablation work

Recommended default streams:

- EEG event stream: raw or lightly detrended, 60 Hz line-noise handling only, no aggressive low-pass that destroys gamma or sharp transients
- EEG cleaned stream: notched plus optional broad bandpass for robustness baselines
- EEG wavelet stream: Haar decomposition coefficients for transient localization

Recommended derived views:

- raw or lightly filtered waveform
- Haar wavelet coefficients across scales
- event snippets around detected bursts or peaks
- bandpower summaries only as baseline or compatibility features
- artifact indicators

### fNIRS

Required steps:

- convert raw optical intensity to HbO and HbR using a consistent pipeline
- apply motion correction
- handle baseline drift and low-frequency trends
- remove or flag bad channels
- use short-separation regression if the hardware and recording setup support it
- resample to a canonical low rate

Recommended derived views:

- HbO and HbR per channel
- temporal derivatives
- region-pooled summaries
- channel quality indicators
- geometry-aware channel neighborhoods

### PPG

PPG is treated as an event-bearing waveform in v2, not only a slow autonomic summary.

Required steps:

- keep a morphology-preserving stream at the highest practical sample rate
- avoid aggressive resampling until morphology benchmarks are complete
- detect or flag clipping and motion artifact
- compute signal quality
- annotate pulse peaks and beat boundaries where possible

Recommended default streams:

- PPG morphology stream: minimal denoising, preserve rising edge, dicrotic notch, and beat shape
- PPG cleaned stream: more robust baseline path for rate and HRV features
- PPG event stream: beat-synchronous crops and aligned pulse templates

Recommended derived views:

- raw waveform
- first derivative and second derivative
- beat-aligned pulse crops
- pulse peaks and inter-beat interval sequence
- rising-edge slope, notch timing, pulse width, and amplitude
- HR and HRV features
- Haar wavelet coefficients across scales

### Preprocessing distortion budget

Every preprocessing step must be characterized before it becomes part of the default pipeline. The table below defines the benchmark ledger that v2 requires.

| Step | Default v2 use | Delay / phase metric to report | Frequency metric to report | Compute metric to report | Event-risk note |
| --- | --- | --- | --- | --- | --- |
| 60 Hz notch, causal IIR | allowed in prototype and online paths | group delay at 10, 20, 40, 60, and 80 Hz | attenuation at 60 Hz and neighboring bins | per-sample microseconds on CPU | can ring around sharp transients and distort waveform shape near 60 Hz |
| 60 Hz notch, zero-phase offline | allowed for offline comparison only | zero net phase after forward-backward pass | attenuation at 60 Hz and neighboring bins | wall-clock cost per minute of data | avoids net delay but doubles filtering work |
| EEG broad bandpass | baseline path only, not event-preserving path | frequency-dependent group delay or zero-phase label | attenuation at 30, 40, 60, 80, and 100 Hz | per-channel throughput | can remove gamma and blunt fast burst edges |
| Polyphase resampling | allowed after anti-alias benchmark | effective latency of anti-alias kernel | attenuation near old and new Nyquist | wall-clock cost and memory | can smear rise time and notch structure if applied too early |
| Learned denoiser | optional comparison path | measured end-to-end latency | power retained in event bands versus noise suppression | train cost and inference cost | may preserve transients better than fixed filters but can hallucinate structure |

Required benchmark outputs for the distortion ledger:

- phase delay or group-delay curves
- frequency attenuation curves
- synthetic transient reconstruction error
- event rise-time error
- waveform-shape error on pulse and burst templates
- wall-clock cost on laptop CPU and workstation GPU

Acceptance rule:

- a preprocessing step is not part of the default training path until its distortion ledger is filled in and reviewed

### 3. Encoders

Recommended encoder strategy by modality:

- EEG: initialize from a strong pretrained EEG model such as LaBraM or BIOT, then attach a small channel adapter and projection head.
- PPG: initialize from a pretrained optical or physiological signal encoder such as PaPaGei, with a small projection head.
- fNIRS: build an internal encoder, likely a compact temporal transformer or temporal convolution plus channel-token transformer.

Important constraint:

Public pretrained models will rarely match Athena channel layouts exactly. Add a channel-layout adaptation layer instead of forcing hard channel identity matching.

Recommended adapter options:

- learned channel embeddings with region labels
- explicit geometry tokens with channel coordinates and source-detector geometry
- graph or neighborhood edges derived from physical layout
- region pooling before the encoder
- interpolation or sparse projection from Athena montage to pretrained expected layout
- small LoRA or adapter blocks instead of full fine-tuning

Geometry preservation policy:

- do not collapse EEG or fNIRS channels into anonymous vectors before the encoder
- preserve spatial coordinates, region identity, and known neighborhood structure in the tokenization step
- treat geometry-aware and geometry-ablated variants as a required ablation pair

### 4. Shared latent space

Each modality encoder should project into a common latent space:

- modality-specific encoder: `E_m`
- projection head: `P_m`
- shared latent: `z_m = P_m(E_m(x_m))`

The shared latent space should support:

- paired contrastive alignment
- cross-modal retrieval
- missing-modality conditioning
- downstream task transfer

The first latent objective is alignment, not generation.

### 5. Translation heads

Use lightweight conditional translators rather than full generative stacks in v1:

- source latent -> target latent predictor
- source latent -> target decoder
- optional lag-aware cross-attention for EEG -> fNIRS

Do not start with diffusion, autoregressive waveform models, or very deep decoders.

### 6. Personalization layer

Subject variability is large in biosignals. Add a small personalization mechanism:

- per-subject calibration statistics
- optional subject embedding during training only
- lightweight subject-specific adapter or affine correction during inference

The model should work without subject identity at inference time, but calibration should improve performance.

---

## Data strategy

### 1. Public data strategy

Use public data in three tiers.

### Tier A: unimodal pretraining

Use large public EEG and PPG corpora to train or adapt encoders with self-supervised objectives.

Examples to evaluate:

- large public EEG corpora such as TUH EEG and Sleep-EDF style datasets
- PhysioNet PPG corpora for pulse morphology and state representation
- open fNIRS datasets aggregated through OpenNeuro and OpenfNIRS

### Tier B: paired-data alignment

Use smaller public paired datasets to learn cross-modal alignment before using scarce Athena data.

Examples to evaluate:

- simultaneous EEG and fNIRS datasets such as OpenNeuro DS004514
- simultaneous EEG and PPG or BVP datasets such as OpenNeuro DS003838, DS006848, and DREAMT

### Tier C: Athena continued pretraining and adaptation

Use Athena data last, not first:

- continue pretraining encoders on unlabeled Athena recordings
- learn paired alignment on Athena windows
- train translation heads on Athena tasks
- reserve a clean internal holdout set that is never used during development

### 2. Internal Athena collection strategy

If data collection is constrained, prioritize repeated sessions over many shallow participants.

Suggested target:

- 8 to 12 participants
- 3 to 5 sessions per participant
- 45 to 75 minutes per session
- sessions spread across different days and times

Suggested protocol blocks per session:

- resting eyes open
- resting eyes closed
- paced breathing
- working memory or n-back
- Stroop or mental arithmetic
- affect or arousal stimulus block
- mild motion or posture-change block

This produces:

- more state diversity
- more within-subject variation
- better calibration data
- more realistic missing-modality robustness

### 3. Data governance and labeling

For every recording, track:

- consent scope
- device firmware and hardware version
- protocol version
- room conditions if relevant
- recent caffeine intake if available
- recent nicotine use if available
- recent exercise if available
- age band and other non-sensitive cohort descriptors approved for use
- known sensor failures
- quality-control outcome

Also track coverage metadata for distribution-shift analysis:

- which slices of the population are represented
- which physiological states are represented
- which artifact types are represented
- where the holdout set differs from the training distribution

Do not mix datasets with incompatible licenses into a commercial model pipeline without review.

---

## Proposed repository shape

This repository is currently SDK oriented. The training stack should stay isolated from shipping runtime code until the research direction is stable.

Recommended additions when implementation begins:

- `docs/architecture-cross-modal-biosignals.md`
- `docs/preprocessing-distortion-ledger.md`
- `scripts/cross_modal/prepare_public_datasets.py`
- `scripts/cross_modal/prepare_athena_dataset.py`
- `scripts/cross_modal/build_windows.py`
- `scripts/cross_modal/make_toy_subset.py`
- `scripts/cross_modal/benchmark_filters.py`
- `scripts/cross_modal/evaluate_preprocessing_distortion.py`
- `scripts/cross_modal/train_fnirs_ssl.py`
- `scripts/cross_modal/train_proto.py`
- `scripts/cross_modal/train_alignment.py`
- `scripts/cross_modal/train_translation.py`
- `scripts/cross_modal/evaluate_translation.py`
- `scripts/cross_modal/evaluate_latent_events.py`
- `scripts/cross_modal/evaluate_shift.py`
- `scripts/cross_modal/export_embeddings.py`
- `scripts/cross_modal/run_ablations.py`
- `configs/cross_modal/*.yaml`
- `configs/cross_modal/proto_cpu.yaml`
- `configs/cross_modal/proto_gpu_small.yaml`
- `configs/cross_modal/full_train.yaml`
- `reports/cross_modal/*.md`

Recommendation:

- keep model training in Python first
- keep inference export and deployment concerns separate
- only move stable preprocessing or inference logic into Rust after the research workflow is validated

## Prototype-first workflow

Every major experiment track needs two modes:

- toy mode: runs on a laptop or personal workstation against a tiny subset
- scale mode: runs on the full curated dataset

Toy-mode requirements:

- one command to build a tiny dataset subset
- one command to train a toy model
- one command to run evaluation and generate a report
- total runtime short enough for same-day iteration

Suggested toy-mode budget:

- 2 to 4 subjects
- 1 to 2 sessions each
- short window counts
- CPU or single consumer GPU execution
- no distributed training

If a phase cannot be exercised in toy mode, it is not ready for the full-data path.

---

## Detailed implementation phases

### Phase 0: Program framing and kill criteria

Execution status as of March 30, 2026:

- completed
- the original first-target decision was EEG-fNIRS
- that decision is now superseded operationally by the EEG-PPG pivot, but the Phase 0 artifacts remain valid

Duration: 1 week

Objectives:

- define the first target problem
- define success metrics
- define what will cause the project to stop or pivot

Tasks:

- lock the first translation task as EEG -> fNIRS
- define secondary tasks as EEG + fNIRS -> PPG event and morphology prediction, then state prediction
- define the internal benchmark splits
- choose experiment tracking and artifact storage
- assign a single source of truth for dataset manifests and configuration
- define toy-mode constraints for every phase

Deliverables:

- [research charter](cross-modal/phase-0-research-charter.md)
- [metric sheet](cross-modal/phase-0-metric-sheet.md)
- [dataset intake checklist](cross-modal/phase-0-dataset-intake-checklist.md)
- [reproducibility checklist](cross-modal/phase-0-reproducibility-checklist.md)
- [toy-mode execution checklist](cross-modal/phase-0-toy-mode-execution-checklist.md)

Exit criteria:

- the team agrees on the first target, metrics, and holdout rules

### Phase 0A: Laptop-scale prototype path

Execution status as of March 25, 2026:

- completed
- the toy dataset builder, local configs, manifest contract, and smoke-test path already exist in the repo

Duration: 1 week

Objectives:

- make small-scale experimentation low friction from the start
- ensure that model, preprocessing, and evaluation code can run without cluster-only infrastructure

Tasks:

- build a toy dataset subset generator
- define tiny configs for CPU and small single-GPU runs
- create a smoke-test training entrypoint that exercises the end-to-end stack
- emit a compact HTML or Markdown report from every toy run
- document expected runtime and memory usage on a laptop or workstation

Deliverables:

- toy dataset builder
- `proto_cpu` config
- `proto_gpu_small` config
- smoke-test training and evaluation command
- [local prototype path doc](cross-modal/phase-0a-local-prototype.md)

Exit criteria:

- a researcher can run a full toy experiment end-to-end locally without custom infrastructure

### Phase 1: Data audit and dataset intake

Execution status as of March 30, 2026:

- partially complete at the program level
- substantially complete for `DS004514`
- still incomplete for Athena internal completion work and for the rest-specific EEG-PPG branch

Completed so far:

- manifest contract and registry
- Athena intake template and intake note
- source-backed `DS004514` intake packet, including ingest note, split plan, normalization note, and intake report
- source-backed `DS003838` intake packet, including worksheet, ingest note, and intake report
- source-backed `DS006848` intake packet, including worksheet, ingest note, and intake report
- executable `DS003838` and `DS006848` EEG-PPG verbalwm Phase 2 artifacts
- candidate manifest for `DREAMT`

Still needed before Phase 1 can be called complete for the EEG-PPG branch:

- decision on whether `DREAMT` enters the first EEG-PPG benchmark set
- real Athena recording specification completion, including internal PPG layout and session storage details
- decision on whether `DS006848` now becomes the primary public EEG-PPG development set

Duration: 2 to 3 weeks

Objectives:

- understand what Athena really records
- ingest public datasets safely
- detect timestamp and quality issues early

Tasks:

- inventory Athena sampling rates, channel maps, and timestamp behavior
- record 2 to 3 pilot internal sessions purely for synchronization and QC analysis
- document packet loss, drift, and missing-data patterns
- select public datasets for EEG, fNIRS, and PPG pretraining
- review licenses and data-use constraints
- write dataset manifests with consistent metadata fields
- define a first event annotation schema for EEG bursts and PPG pulse morphology
- define shift-metadata fields such as caffeine, exercise, age band, and artifact context when available

Deliverables:

- Athena recording specification
- public dataset registry
- license review notes
- pilot QC report
- event annotation schema
- shift-metadata schema

Exit criteria:

- the team can load all selected datasets into a common manifest
- pilot recordings show that synchronization is measurable and correctable

### Phase 2: Preprocessing, synchronization, and windowing

Execution status as of March 25, 2026:

- in progress
- materially implemented for the `DS004514` pilot path
- not yet implemented for EEG-PPG

Completed so far:

- `DS004514` canonicalized paired EEG-fNIRS artifact
- `DS004514` Phase 2 window dataset with:
  - event-preserving EEG windows
  - cleaned EEG windows
  - canonicalized fNIRS targets
  - per-window quality flags
- first preprocessing distortion ledger entry for the cleaned EEG path

Still needed before Phase 2 can be called complete for the new business target:

- morphology-preserving and cleaned PPG preprocessing paths
- first EEG-PPG Phase 2 artifact for `DS003838`
- first EEG-PPG distortion benchmark for the cleaned PPG path
- random window inspection support for the EEG-PPG branch
- Athena-facing Phase 2 implementation after the public EEG-PPG path is stable

Duration: 2 to 4 weeks

Objectives:

- build a canonical training dataset
- prevent silent data bugs
- measure what preprocessing costs before treating it as neutral

Tasks:

- implement modality-specific preprocessing pipelines
- implement dual-path preprocessing for event-preserving and cleaned views
- define canonical sampling rates for training
- align streams on a shared monotonic timeline
- create fixed-length windows with stride
- attach quality masks and protocol labels to each window
- create visualization scripts for random window inspection
- create automated checks for sample counts, drift, and NaNs
- benchmark group delay, attenuation, and transient distortion for each preprocessing path
- compare fixed filtering with a learned denoising comparison path

Recommended starting defaults:

- EEG cleaned stream resampled to 256 Hz
- EEG event stream kept at the highest practical rate until distortion benchmarks are complete
- PPG cleaned stream resampled only after morphology retention is benchmarked
- PPG morphology stream kept at the highest practical rate until beat-shape retention is benchmarked
- fNIRS resampled to 10 Hz
- 16-second windows for EEG and cleaned PPG paths
- 32-second context windows for tasks involving fNIRS
- 50 percent overlap during training window creation

Important note:

The hardware synchronization problem and the physiological delay problem are different.

- Hardware alignment should be corrected at ingest time.
- Physiological lag, especially for EEG -> fNIRS, should be modeled during training.

Deliverables:

- reusable preprocessing scripts
- canonical window dataset
- QC dashboards or reports
- preprocessing distortion ledger
- side-by-side event-preserving versus cleaned-path comparison report

Exit criteria:

- random windows are inspectable and trustworthy
- cross-stream timestamp errors are quantified
- quality masks exclude obviously corrupted segments
- preprocessing distortion is measured rather than assumed

### Phase 3: Baselines before deep modeling

Execution status as of March 25, 2026:

- preview only
- the repo has negative-control baseline work for `DS004514`
- the real baseline phase has not started for EEG-PPG

Completed so far:

- routed versus canonicalized baseline comparison for the `DS004514` reference path

Still needed before this phase is genuinely underway for the current goal:

- subject-mean, session-mean, and simple neural baselines on the EEG-PPG artifact
- wavelet-versus-STFT baseline comparison for EEG-PPG
- morphology-target-versus-state-target baseline comparison for EEG-PPG

Duration: 2 weeks

Objectives:

- establish a floor that the learned model must beat
- prevent wasted time on underdetermined tasks

Tasks:

- implement subject-mean and session-mean null baselines
- implement lagged linear regression from EEG features to fNIRS targets
- implement CCA or PLS baselines for EEG-fNIRS and EEG-PPG feature mapping
- implement a small TCN or GRU baseline for sequence-to-sequence prediction
- evaluate all baselines under leave-one-subject-out and leave-one-session-out settings
- compare Fourier bandpower baselines against Haar wavelet baselines
- compare cleaned-path inputs against event-preserving-path inputs

Feature targets for baseline work:

- EEG wavelet coefficients by channel and region
- EEG bandpower by channel and region as a baseline only
- fNIRS regional HbO and HbR summaries
- PPG beat shape, rising-edge slope, notch timing, heart rate, HRV, amplitude, and pulse-shape summaries

Deliverables:

- baseline benchmark report
- ranked list of viable and non-viable prediction targets
- wavelet-versus-STFT comparison report
- event-preserving-versus-cleaned-path comparison report

Exit criteria:

- at least one EEG -> fNIRS baseline beats null on held-out data
- if EEG -> PPG raw mapping fails completely, the team narrows PPG to state-level targets first

### Phase 4: Unimodal representation learning

Duration: 3 to 5 weeks

Objectives:

- create strong modality-specific representations
- minimize the amount of Athena paired data needed later

Tasks:

- integrate a pretrained EEG encoder
- integrate a pretrained PPG encoder
- train an internal fNIRS self-supervised encoder
- add lightweight projection heads for all modalities
- evaluate each encoder with linear probes on simple public tasks
- continue pretraining all encoders on unlabeled Athena data
- add event probes where sparse annotations or pseudo-labels are available

Recommended self-supervised objectives:

- masked reconstruction
- temporal contrastive learning
- context prediction
- channel dropout robustness

Recommended fNIRS encoder starting point:

- channel-token transformer or temporal CNN plus transformer
- inputs: HbO, HbR, temporal derivative, channel quality
- small hidden size, for example 256 to 384
- 4 to 6 layers, not a giant stack

Recommended fine-tuning policy:

- freeze most pretrained encoder weights first
- train projection heads and adapters
- unfreeze selected blocks only after the heads stabilize

Deliverables:

- reusable unimodal encoders
- linear-probe benchmark report
- Athena continued-pretraining checkpoint set
- event-probe benchmark report

Exit criteria:

- each modality encoder produces embeddings that are stable and informative on held-out data

### Phase 5: EEG <-> fNIRS latent alignment

Duration: 3 to 4 weeks

Objectives:

- learn a shared latent space using paired windows
- prove that cross-modal structure can be recovered before generation

Tasks:

- freeze or mostly freeze the unimodal encoders
- project EEG and fNIRS embeddings into a common latent space
- train a paired contrastive objective
- add lag-aware positive matching for EEG-fNIRS windows
- add subject-balanced batching
- add modality dropout to support missing-modality conditioning
- add a subject-adversarial or subject-invariant auxiliary objective if identity leakage is high
- run latent-space event-decoding and latent-direction tests on each checkpoint family

Recommended objectives:

- InfoNCE or supervised contrastive alignment
- latent similarity loss between paired windows
- optional temporal order consistency loss
- optional domain adversarial loss against subject ID

Recommended lag strategy:

- treat windows within a small lag neighborhood as candidate positives
- let the model learn a soft weighting over lag offsets
- log the selected lag distribution to verify that it is physiologically plausible

Deliverables:

- aligned EEG-fNIRS latent model
- cross-modal retrieval benchmark
- subject leakage report
- latent event-decoding report
- latent direction and ablation report

Exit criteria:

- EEG and fNIRS retrieval from the shared latent space is materially above chance
- alignment is stable on held-out subjects
- at least one event type is decodable from the bottleneck better than a trivial background classifier

### Phase 6: EEG -> fNIRS translation

Duration: 3 to 4 weeks

Objectives:

- build the first conditional prediction model
- keep the target realistic and biologically grounded

Tasks:

- train a lightweight translator from EEG latent to fNIRS latent
- decode predicted fNIRS latent to regional HbO and HbR outputs first
- add channel-level decoding only after regional decoding is stable
- compare latent translation and direct signal prediction
- evaluate multiple history lengths for the EEG context window
- compare region-level, channel-level, and future-window targets

Recommended v1 target hierarchy:

1. region-level HbO and HbR curves
2. channel-level HbO and HbR curves
3. downstream-task features derived from predicted fNIRS

Recommended loss family:

- pointwise reconstruction loss
- correlation loss
- derivative or smoothness loss
- spectral convergence loss on low-frequency structure
- event-alignment loss where sparse event labels exist

Do not judge this phase only by MSE. Also inspect:

- correlation
- lag accuracy
- coherence
- event retention or event timing error
- whether predicted fNIRS helps a downstream task

Deliverables:

- first EEG -> fNIRS translation model
- ablation report on lag handling, encoder freezing, and target granularity

Exit criteria:

- the translation model beats linear and simple neural baselines on held-out subjects
- predicted fNIRS features are useful, not merely smooth

### Phase 7: Add PPG event, morphology, and state targets

Duration: 3 to 4 weeks

Objectives:

- add the third modality without collapsing it into slow state summaries
- preserve beat-level morphology and event structure

Tasks:

- start with PPG event and morphology targets: beat timing, rising-edge slope, notch timing, pulse width, amplitude, and quality
- train EEG -> PPG embedding prediction and EEG + fNIRS -> PPG morphology prediction
- compare direct morphology prediction to latent prediction plus decoder
- evaluate whether cleaned and morphology-preserving input paths change what is learnable
- only attempt raw PPG reconstruction after morphology-level targets show signal
- derive state targets such as HR and HRV from predicted events as a secondary step rather than the only objective

Recommended order:

1. predict PPG event and morphology features from EEG and from EEG + fNIRS
2. predict PPG latent embeddings
3. derive or predict state summaries such as HR and HRV
4. optionally decode a waveform once morphology retention is demonstrated

Important caution:

If EEG -> PPG underperforms badly but EEG + fNIRS -> PPG works, that is still a positive result. It would mean the indirect pathway benefits from the hemodynamic bridge and shared-state information.

Deliverables:

- PPG event and morphology benchmark
- PPG embedding predictor
- decision memo on whether raw PPG reconstruction is worth pursuing
- morphology-retention report across preprocessing paths

Exit criteria:

- at least one PPG event or morphology target family is predictable on held-out subjects well enough to support downstream use

### Phase 8: Tri-modal latent model and missing-modality inference

Duration: 4 weeks

Objectives:

- extend the system from paired alignment to true multimodal conditioning

Tasks:

- train a shared tri-modal latent space
- sample random modality subsets during training
- reconstruct available and missing modalities from partial inputs
- compare pairwise and tri-modal training schedules
- test whether PPG improves EEG-fNIRS alignment or merely adds noise
- test whether morphology-preserving PPG views improve tri-modal performance over cleaned-only PPG views

Recommended training behavior:

- random modality dropout
- pairwise batches mixed with tri-modal batches
- strong weighting on paired and tri-paired windows with highest quality

Deliverables:

- tri-modal missing-modality model
- ablation report comparing pairwise and tri-modal strategies
- tri-modal morphology-versus-state ablation report

Exit criteria:

- the tri-modal model is at least as good as the best pairwise model on primary tasks

### Phase 9: Personalization and calibration

Duration: 2 to 3 weeks

Objectives:

- close the subject variability gap without requiring full retraining

Tasks:

- add a brief calibration protocol
- learn per-subject affine corrections or lightweight adapters
- compare zero-shot versus calibrated performance
- test whether calibration improves translation or only downstream tasks
- stratify calibration benefit by shift variables such as age band, caffeine, exercise, and artifact load when available

Recommended calibration design:

- 2 to 5 minutes
- rest plus paced breathing
- estimate subject-specific normalization and latent shift

Deliverables:

- calibration workflow
- personalized inference benchmark

Exit criteria:

- calibration improves a meaningful subset of held-out users without harming zero-shot behavior

### Phase 10: Packaging and deployment path

Duration: 2 to 4 weeks

Objectives:

- package the useful research outputs without prematurely hardening unstable components

Tasks:

- export stable encoders and translation heads
- define a minimal inference API
- benchmark CPU and edge-device inference requirements
- decide which pieces belong in Python-only research and which belong in Rust or WASM
- write model cards and usage constraints

Deliverables:

- exported checkpoints
- inference wrapper
- model card and known-limitations document

Exit criteria:

- the team can run reproducible inference on recorded Athena windows outside the training environment

---

## Detailed model specification

### 1. Input representations

Recommended starting point:

- EEG: raw waveform patches plus optional Haar wavelet side-channel
- fNIRS: HbO and HbR sequences with derivatives and quality masks
- PPG: raw waveform, first and second derivative, beat-aligned pulse crops, and morphology features

Do not over-engineer handcrafted features, but do include low-cost physiological summaries for baselines and error analysis.

Preferred derived-view policy:

- use Haar wavelets as the default cheap time-frequency view for event-bearing signals
- keep STFT and bandpower features only as baseline comparisons and compatibility features
- evaluate whether the wavelet view improves event decoding and latent interpretability

### 2. Windowing

Starting defaults:

- EEG encoder window: 16 seconds for context, with shorter event crops for burst analysis
- PPG encoder window: 16 seconds for context, with beat-synchronous crops for morphology
- fNIRS encoder window: 32 seconds
- stride: 8 seconds

For EEG -> fNIRS specifically:

- use EEG history long enough to cover expected neurovascular delay
- allow the model to predict current and near-future fNIRS
- compare fixed-lag and learned-lag formulations

Windowing rule for PPG:

- do not downsample the morphology stream until pulse-shape distortion has been benchmarked

### 3. Model size

Start small.

Suggested defaults:

- latent dimension: 256
- transformer layers per encoder: 4 to 6
- attention heads: 4 to 8
- dropout: around 0.1
- adapter or LoRA rank: 8 to 32 if needed

Avoid large models until the small model proves that the task is learnable.

### 4. Loss stack

Recommended training losses by stage:

- `L_ssl`: unimodal self-supervised loss
- `L_align`: paired contrastive alignment
- `L_latent`: target latent regression
- `L_recon`: signal or feature reconstruction
- `L_corr`: correlation or cosine similarity objective
- `L_smooth`: derivative or temporal smoothness regularization
- `L_subject`: subject-adversarial or subject-invariance objective
- `L_event`: event timing or morphology loss where labels or pseudo-labels exist
- `L_wavelet`: reconstruction loss in wavelet space for event-preserving comparisons

Start simple:

- phase 4: `L_ssl`
- phase 5: `L_align + L_subject`
- phase 6: `L_latent + L_recon + L_corr + L_event`
- phase 7 and later: add `L_smooth`, `L_wavelet`, and modality dropout consistency losses

### 5. Augmentations

Use augmentations that match biosignal failure modes.

Recommended augmentations:

- EEG: channel dropout, small temporal jitter, amplitude scaling, frequency masking
- fNIRS: motion spike injection, channel dropout, baseline drift augmentation
- PPG: amplitude scaling, baseline wander, motion-like bursts, random masking

Avoid aggressive augmentations that create unrealistic physiology.

### 6. Batching

Recommended batching strategy:

- subject-balanced batches
- protocol-balanced batches when possible
- mixed unimodal, pairwise, and tri-modal batches by phase
- oversample high-quality windows early
- keep event-positive windows visible in every epoch once event labels or pseudo-labels exist

---

## Evaluation plan

### 1. Split strategy

Always evaluate with:

- leave-one-subject-out
- leave-one-session-out
- temporal holdout within subject

If enough data exists, also evaluate:

- protocol holdout
- day-to-day drift
- sensor-placement variation
- explicit distribution-shift slices such as caffeine, exercise, age band, and artifact burden when available

### 2. Metrics by target family

### Shared latent space

- cross-modal retrieval accuracy
- embedding clustering by task and state
- subject leakage score
- linear-probe transfer performance
- event decoding accuracy from the bottleneck
- latent direction stability for waveform morphology probes
- intervention score: effect of ablating a learned latent direction on reconstruction

### EEG -> fNIRS

- Pearson or Spearman correlation
- lag-aware correlation
- spectral error in low-frequency bands
- HbO and HbR trend accuracy
- event retention where event labels are available
- downstream-task performance using predicted versus measured fNIRS

### EEG or EEG + fNIRS -> PPG

- HR MAE
- HRV feature error
- beat-timing error
- rising-edge slope error
- dicrotic-notch timing error
- pulse amplitude and quality prediction accuracy
- embedding similarity
- optional waveform correlation if raw reconstruction is attempted

### 2A. Representation intervention tests

Use the same protocol family on every checkpoint series:

- train a simple linear or shallow nonlinear probe to decode one event label from `z`
- fit sparse linear directions or concept vectors linked to one morphology attribute
- zero, shrink, or move along one learned direction before decoding
- measure whether the targeted event or morphology changes while unrelated structure is preserved

This section is mandatory in v2 because a latent space can look useful while still encoding nothing interpretable about events.

### Preprocessing distortion

- group-delay curves by preprocessing path
- attenuation curves by preprocessing path
- synthetic transient reconstruction error
- event rise-time error
- waveform-shape error on beat templates and neural burst templates
- CPU and GPU wall-clock cost by minute of signal

### 3. Baseline set

Every major result should be compared against:

- null mean baseline
- lagged linear regression
- CCA or PLS
- small TCN or GRU
- no-pretraining variant
- no-lag variant for EEG -> fNIRS
- cleaned-path-only versus event-preserving-path comparison
- STFT or bandpower features versus Haar wavelet features

### 4. Ablations

Required ablations:

- no public pretraining
- no Athena continued pretraining
- no lag-aware positives
- no subject-adversarial objective
- no modality dropout
- region-level versus channel-level targets
- state-target versus waveform-target PPG training
- no-geometry tokens versus geometry-aware tokens
- no-event loss versus event-aware loss
- fixed filtering versus learned denoising comparison path
- cleaned-path only versus dual-path preprocessing

### 5. Failure analysis

For failed runs, inspect:

- subject leakage
- timestamp drift
- motion contamination
- whether the model learned protocol labels rather than physiology
- whether the model predicts only smoothed averages
- whether the target is too underdetermined for the given source modality
- whether the preprocessing path destroyed the event structure before training

### 6. Data quality and distribution-shift diagnostics

Every evaluation report should include:

- per-window quality score distributions
- per-session quality score distributions
- coverage maps over subject, protocol, and shift metadata
- reconstruction and prediction error stratified by shift bucket
- uncertainty or confidence calibration under in-distribution and shifted conditions

Recommended data quality score components:

- sensor dropout fraction
- clipping fraction
- motion artifact score
- line-noise residual
- synchronization confidence
- event detectability score for EEG and PPG when applicable

Recommended shift diagnostics:

- compare training and holdout distributions for age band, protocol, artifact burden, caffeine, exercise, and nicotine when available
- measure where reconstruction error increases sharply across those slices
- log which modality pair breaks first under shift

---

## Internal data collection protocol

If the team can collect only a small amount of new data, use a protocol that creates both state diversity and calibration utility.

Suggested session template:

- 5 minutes resting eyes open
- 5 minutes resting eyes closed
- 5 minutes paced breathing
- 10 minutes working memory or n-back
- 10 minutes Stroop or mental arithmetic
- 10 minutes affect or arousal stimulus
- 5 minutes posture change and mild movement

Add notes for:

- sensor placement
- participant fatigue
- interruptions
- visible motion artifact
- recent caffeine intake if collected
- recent nicotine use if collected
- recent exercise if collected
- age band or cohort label if approved for use

Why this matters:

- rest and paced breathing improve calibration
- cognitive tasks drive EEG and fNIRS changes
- affect and arousal create useful PPG variation
- mild motion blocks make the model less brittle
- shift metadata makes failure under real-world variation measurable rather than anecdotal

---

## Tooling and MLOps

Recommended tooling:

- PyTorch for model training
- Hydra or plain YAML configs for experiments
- Weights and Biases or MLflow for run tracking
- DVC, LakeFS, or simple versioned manifests for dataset snapshots
- deterministic seed logging and checkpoint metadata

Minimum reproducibility requirements:

- every run logs code version, config, dataset version, and preprocessing version
- every reported metric links back to an immutable evaluation split
- every exported model has a model card and known-limitations note

---

## Staffing and compute assumptions

This plan is designed for a small team.

Minimum practical staffing:

- 1 research engineer or ML scientist
- 1 signal-processing engineer or applied scientist
- part-time support from the Athena data collection side

Minimum practical compute:

- one strong single-GPU workstation is enough for the first phases
- 24 GB VRAM class hardware is sufficient for compact models
- large multi-GPU infrastructure is not required until much later

Do not wait for large compute to start. Data quality and task design matter more here.

---

## Risks and mitigations

### Risk 1: the target mapping is too underdetermined

Example:

- raw EEG -> raw PPG may fail because the relationship is indirect

Mitigation:

- move to state targets or latent targets first
- use EEG + fNIRS as the source when predicting PPG

### Risk 2: subject leakage inflates results

Mitigation:

- use leave-one-subject-out evaluation
- add subject-adversarial training
- report identity leakage explicitly

### Risk 3: timestamp or drift bugs dominate the experiment

Mitigation:

- solve synchronization early
- keep QC dashboards
- never train on windows that have not passed alignment checks

### Risk 4: fNIRS preprocessing choices change the target too much

Mitigation:

- lock a preprocessing pipeline version
- test sensitivity to motion correction and baseline handling
- compare region-level and channel-level targets

### Risk 5: public datasets do not match Athena sensor layout

Mitigation:

- use channel adapters and region pooling
- do not depend on exact channel identity matching

### Risk 6: the team prematurely hardens unstable research code into the SDK

Mitigation:

- keep training in scripts and configs first
- promote only stable inference components into runtime code later

### Risk 7: preprocessing destroys the very events the model should learn

Mitigation:

- maintain event-preserving and cleaned paths in parallel
- require a distortion ledger before adopting a filter as default
- compare fixed filters against a learned denoising path

### Risk 8: the model fails under distribution shift

Mitigation:

- collect and track shift metadata
- stratify evaluation by shift slices instead of reporting only global averages
- attach uncertainty and confidence diagnostics to every evaluation report

---

## Milestone roadmap

Suggested 26-week sequence:

- Weeks 1 to 2: Phase 0 and Phase 0A
- Weeks 3 to 5: Phase 1
- Weeks 6 to 9: Phase 2 and preprocessing distortion benchmark work
- Weeks 10 to 12: Phase 3
- Weeks 13 to 17: Phase 4
- Weeks 18 to 20: Phase 5
- Weeks 21 to 23: Phase 6
- Weeks 24 to 26: Phase 7, then decide whether to continue into Phase 8 or pivot based on evidence

Recommended first major milestone:

- original scientific milestone: prove that EEG -> fNIRS is learnable beyond linear baselines on held-out subjects
- current business-priority milestone: at pilot scope, at least one EEG -> PPG morphology target family already beats a null baseline on held-out subjects; the next bar is to reproduce that outside the narrow pilot split

Recommended second major milestone:

- show that inferred fNIRS or inferred PPG features improve a downstream task and that at least one event type is recoverable from the latent space

Only after those two milestones should the team invest in:

- tri-modal generative models
- more complex decoders
- edge deployment optimization

---

## Deliverables

By the end of the initial program, the team should have:

- a canonical Athena multimodal dataset format
- reusable preprocessing pipelines for EEG, fNIRS, and PPG
- a preprocessing distortion ledger with measured filter costs
- public-data and Athena-data manifests
- toy-mode configs and smoke-test commands
- baseline benchmark reports
- wavelet-versus-STFT comparison results
- pretrained or adapted unimodal encoders
- an aligned EEG-fNIRS latent model
- an EEG -> fNIRS translation model
- a PPG event, morphology, and state benchmark
- latent event-decoding and intervention reports
- distribution-shift diagnostic reports
- a decision memo on tri-modal expansion
- exported checkpoints and model cards for any model that survives review

---

## Final recommendation

Do not try to "tie together" pretrained models by directly chaining one model's outputs into another model's decoder on day one.

Do this instead:

1. Reuse pretrained encoders where they exist.
2. Add small adapters to match Athena channel layouts.
3. Preserve event-bearing raw structure through dual-path preprocessing and explicit distortion benchmarking.
4. Prefer Haar wavelet views over default STFT summaries for cheap event localization.
5. Learn a shared latent space on paired windows.
6. Validate that the latent space actually contains event information before trusting it.
7. Train lightweight translation heads only after the latent space is stable.
8. Treat PPG as an event-bearing waveform as well as a state signal.
9. Keep every major experiment runnable in toy mode on local hardware.
10. Use EEG <-> fNIRS as the completed reference path, but start the next execution branch with EEG-PPG.

That path is still scientifically defensible, but it also matches the current business-priority shift.

---

## Reference starting points

The following papers and datasets are good starting points for implementation and dataset intake review:

- LaBraM EEG encoder: `https://arxiv.org/abs/2405.18765`
- BIOT biosignal encoder: `https://arxiv.org/abs/2305.10351`
- PaPaGei optical physiology encoder: `https://arxiv.org/abs/2410.20542`
- NormWear wearable representation model: `https://arxiv.org/abs/2412.09758`
- EEG -> fNIRS generation paper: `https://arxiv.org/abs/2407.04736`
- EEG-fNIRS prediction via multimodal autoencoder: `https://pmc.ncbi.nlm.nih.gov/articles/PMC9547786/`
- EEG-fNIRS multimodal review: `https://pmc.ncbi.nlm.nih.gov/articles/PMC12592382/`
- OpenfNIRS data index: `https://openfnirs.org/data/`
- OpenNeuro DS004514: `https://doi.org/10.18112/openneuro.ds004514.v1.1.2`
- OpenNeuro DS003838: `https://doi.org/10.18112/openneuro.ds003838.v1.0.6`
- OpenNeuro DS006848: `https://doi.org/10.18112/openneuro.ds006848.v1.0.0`
- PhysioNet DREAMT: `https://physionet.org/content/dreamt/`

