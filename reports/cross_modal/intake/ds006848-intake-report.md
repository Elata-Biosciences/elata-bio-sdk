# DS006848 Intake Report

Status: Source-Backed Candidate

## Required metadata

- Dataset ID: `public_ds006848`
- Manifest: [../../../manifests/cross_modal/public_ds006848.json](../../../manifests/cross_modal/public_ds006848.json)
- Worksheet: [../../../docs/cross-modal/ds006848-intake-worksheet.md](../../../docs/cross-modal/ds006848-intake-worksheet.md)
- Ingest note: [../../../docs/cross-modal/ds006848-ingest-note.md](../../../docs/cross-modal/ds006848-ingest-note.md)
- Subject quality policy: [../../../docs/cross-modal/ds006848-subject-quality-policy.md](../../../docs/cross-modal/ds006848-subject-quality-policy.md)
- Intake owner: unassigned
- Intake date: 2026-04-04
- Source version: `v1.0.0`
- Current recommendation: keep as candidate and use as the cleaner public EEG-PPG reference path plus rest-branch candidate, not as an established positive baseline

## Scope

This report records the first source-backed findings from the official `1.0.0` OpenNeuro snapshot for `DS006848`.

The current pass verifies snapshot metadata, root structure, full subject coverage, task coverage, sidecars, and the exact EEG-PPG layout used by the source tree.

## Source access

- Access path: `external://openneuro/ds006848`
- Download or mount method: direct OpenNeuro S3 listing plus direct sidecar access
- Snapshot or release tag: `v1.0.0`
- License check: confirmed `CC0`

## Raw layout findings

- Top-level directories: `stimuli/` plus `30` subject folders
- Subject naming pattern: `sub-XXX`
- Session naming pattern: no session subdirectories observed in the snapshot tree
- File formats:
  - BrainVision `.vhdr`, `.vmrk`, `.eeg`
  - `.json`
  - `.tsv`
- BIDS compliance notes:
  - snapshot metadata reports `BIDSVersion` `1.7.0`
  - all subjects expose `eeg/`
  - all subjects expose `sub-XXX_scans.tsv`
  - behavior files exist only for `task-verbalwm`

## Modality findings

### EEG

- Confirmed present: yes for all `30` subjects
- Confirmed raw format: BrainVision
- Confirmed channel count: `63`
- Confirmed sampling rate: `1000 Hz`
- Channel naming and montage notes:
  - the montage uses an extended 10/20 layout
  - geometry sidecars are present for every subject via `*_electrodes.tsv` and `*_coordsystem.json`
- Auxiliary channel notes:
  - the task sidecars report `EEGChannelCount=63`, `ECGChannelCount=1`, and `MiscChannelCount=1`
  - the extra two channels are `PPG` and `ECG`

### fNIRS

- Confirmed present: no
- Confirmed raw format: not applicable
- Confirmed sampling rate: not applicable
- Source-detector geometry notes: not applicable
- HbO/HbR conversion notes: not applicable

### PPG

- Confirmed present: yes, but not as a dedicated BIDS subtree
- Confirmed raw format: BrainVision channel inside the `eeg/` recording
- Confirmed sampling rate: `1000 Hz`
- Morphology preservation notes:
  - the sampled channel table exposes `PPG` as `type=MISC`
  - the same BrainVision container also holds a single `ECG` channel
  - because PPG is stored at the native recording rate inside the shared task file, morphology preservation is plausible
  - broader verbalwm waveform-quality benchmarking now confirms that morphology-grade PPG is available for most of a representative `12`-subject subset, but weak cases still cluster around `sub-016`, `sub-017`, and `sub-025`

## Pairing and timing

- Simultaneous recording confirmed: yes
- Alignment field or trigger source:
  - EEG, PPG, and ECG are recorded in the same BrainVision file for each task
  - events are stored in the same task subtree under `eeg/`
- Drift concerns:
  - the first DS006848 artifact should not require cross-file alignment logic
  - alignment risk is lower than `DS003838` because the signals are already co-recorded in one file
- Canonical windowing risk notes:
  - the first DS006848 Phase 2 artifact should still verify sample-count equality and task-sidecar consistency
  - the default first benchmark should be verbalwm-only because rest is absent for `8` subjects

## Phase 2 pilot result

- Pilot split:
  - train `sub-001`
  - eval `sub-007`
  - task `verbalwm`
- Artifact outputs:
  - `512` paired windows
  - EEG event tensor shape `512 x 63 x 500`
  - EEG clean tensor shape `512 x 63 x 128`
  - PPG native tensor shape `512 x 2000`
  - PPG clean tensor shape `512 x 256`
- Pilot quality result:
  - `512 / 512` windows pass the current quality gate
  - mean detected PPG peak count per window: about `3.268`
  - measured alignment RMSE and max residual are both `0.0 s` because the signals share one task file
- Pilot benchmark result:
  - cleaned EEG path shows near-zero measured off-notch delay and attenuation, with about `-21.898 dB` at `50 Hz`
  - cleaned PPG path keeps `1-10 Hz` probes near-neutral, is about `-6.003 dB` at `20 Hz`, and strongly suppresses `30 Hz` and `50 Hz`
  - the DS006848 cleaned PPG branch has a smaller absolute amplitude scale than the earlier DS003838 pilot, so the `ppg_clean_std` quality gate is dataset-specific here

## First verbalwm development result

- Expanded split:
  - train `sub-001`, `sub-010`
  - eval `sub-007`, `sub-012`
  - task `verbalwm`
- Artifact outputs:
  - `1024` paired windows
  - `1024 / 1024` quality-pass windows
  - EEG event tensor shape `1024 x 63 x 500`
  - EEG clean tensor shape `1024 x 63 x 128`
  - PPG native tensor shape `1024 x 2000`
  - PPG clean tensor shape `1024 x 256`
- Expanded quality result:
  - measured alignment RMSE and max residual remain `0.0 s`
  - mean detected peak count per window stays about `3.270`
  - per-subject peak-count means now show real subject variation:
    - `sub-001` train: about `3.008`
    - `sub-010` train: about `2.965`
    - `sub-007` eval: about `3.527`
    - `sub-012` eval: about `3.578`

## Pilot target result

- quality-pass train windows: `256`
- quality-pass eval windows: `256`
- dominant-beat-valid train windows: `252`
- dominant-beat-valid eval windows: `256`
- notch-valid train windows: `28`
- notch-valid eval windows: `0`

Practical reading:

- dominant-beat morphology targets are already viable on essentially the full current DS006848 pilot
- notch timing remains a masked diagnostic target and is more asymmetric here than on the early DS003838 pilot
- the next useful step is subject expansion, not immediate promotion of notch timing

## First expanded target result

- quality-pass train windows: `512`
- quality-pass eval windows: `512`
- dominant-beat-valid train windows: `508`
- dominant-beat-valid eval windows: `512`
- notch-valid train windows: `54`
- notch-valid eval windows: `0`

Practical reading:

- dominant-beat morphology targets stay effectively dense under mild subject expansion
- notch timing remains entirely train-side and is still not a credible primary target
- the main remaining unknown is generalization, not target availability

## First expanded baseline and slice-analysis result

- Both EEG branches beat null on aggregate standardized MSE on the 4-subject verbalwm split
- `eeg_event_windows` is currently the best branch
- the aggregate win is still narrow:
  - `amplitude_range` and `dominant_beat_amplitude` beat null on MSE
  - `rising_edge_slope_max`, mean IBI, dominant-beat rise time, and dominant-beat width do not
- the first slice-analysis pass now shows:
  - `sub-012` carries most of the current amplitude-family gain
  - `sub-007` still loses overall because timing-family errors dominate
  - the lower two `ppg_clean_std` eval quartiles remain worse than null

Practical reading:

- the earlier 4-subject DS006848 result was promising enough to justify wider expansion
- it was useful as a positive-check result, but it was never broad enough to justify deeper modeling on its own

## Broader verbalwm development result

- Broader split:
  - train `sub-001`, `sub-010`, `sub-013`, `sub-015`
  - eval `sub-007`, `sub-012`, `sub-016`, `sub-017`
  - task `verbalwm`
- Artifact outputs:
  - `2048` paired windows
  - `1983 / 2048` quality-pass windows
  - EEG event tensor shape `2048 x 63 x 500`
  - EEG clean tensor shape `2048 x 63 x 128`
  - PPG native tensor shape `2048 x 2000`
  - PPG clean tensor shape `2048 x 256`
- Broader quality result:
  - measured alignment RMSE and max residual remain `0.0 s`
  - train quality-pass windows remain dense at `1024 / 1024`
  - eval quality-pass windows drop to `959 / 1024`
  - that quality attrition is concentrated in:
    - `sub-016`: `235 / 256`
    - `sub-017`: `212 / 256`

## Broader target result

- quality-pass train windows: `1024`
- quality-pass eval windows: `959`
- dominant-beat-valid train windows: `1019`
- dominant-beat-valid eval windows: `959`
- notch-valid train windows: `55`
- notch-valid eval windows: `123`

Practical reading:

- dominant-beat morphology targets remain dense on the broader split
- the broader DS006848 failure is not driven by target sparsity
- notch timing is no longer train-only, but it is still too sparse and uneven to promote

## Broader baseline and slice-analysis result

- Neither EEG branch beats null on aggregate standardized MSE on the broader 8-subject verbalwm split
- `eeg_clean_windows` is now the least-bad branch
- all tracked targets fail to beat null on MSE on the broader split
- the broader slice-analysis pass now shows:
  - `sub-016` is the dominant failure case by a wide margin
  - `sub-017` also underperforms, though less severely
  - all peak-count and `ppg_clean_std` quality slices remain worse than null
  - amplitude-family targets still carry the largest error concentration
- the reviewed verbalwm cohort now has an explicit subject-quality policy:
  - `sub-016` is `stress_test_only`
  - `sub-017` is `borderline_review`
  - the remaining `22` verbalwm subjects stay `pending_review`

Practical reading:

- the earlier 4-subject DS006848 win does not survive the next subject expansion
- DS006848 is still the cleaner public EEG-PPG intake path in the repo
- but it is no longer defensible to treat DS006848 as a standing positive baseline

## Rest Phase 2 pilot result

- Rest split:
  - train `sub-001`
  - eval `sub-007`
  - task `rest`
- Artifact outputs:
  - `20` paired windows
  - `20 / 20` quality-pass windows
  - EEG event tensor shape `20 x 63 x 500`
  - EEG clean tensor shape `20 x 63 x 128`
  - PPG native tensor shape `20 x 2000`
  - PPG clean tensor shape `20 x 256`
- Rest event-family result:
  - `rest_state`: `16` windows from `Eyes_Closed` and `Eyes_Opened`
  - `rest_cartoon`: `4` windows from `Start_Cartoon` and `End_Cartoon`

Practical reading:

- the first rest branch is now real, not planned
- alignment remains `0.0 s` because EEG, PPG, and ECG share one BrainVision recording
- the rest branch is now target-complete at smoke scope; the next question is whether it should stay a smoke contract or expand into a real rest benchmark

## Broader verbalwm waveform-quality review result

- Reviewed verbalwm subjects:
  - `sub-001`, `sub-002`, `sub-007`, `sub-010`, `sub-011`, `sub-012`, `sub-013`, `sub-015`, `sub-016`, `sub-017`, `sub-025`, `sub-035`
- Aggregate outputs:
  - `1536` sampled windows
  - `1509 / 1536` quality-pass windows
  - `1526 / 1536` dominant-beat-valid windows
  - `131 / 1536` notch-valid windows
- Highest composite-quality subjects:
  - `sub-012`
  - `sub-002`
  - `sub-015`
  - `sub-013`
- Lowest composite-quality subjects:
  - `sub-017`
  - `sub-016`
  - `sub-025`

Practical reading:

- the broader DS006848 verbalwm issue is not a universal lack of morphology-grade PPG
- the weak cases reinforce the existing subject-quality policy rather than contradicting it
- the strongest current pending-review verbalwm promotion candidates are `sub-002` and `sub-035`
- `sub-011` is a reasonable verbalwm-only secondary candidate because waveform quality is acceptable, but it remains unsuitable for rest-branch planning because `RS_excluded=yes`

## Rest target result

- quality-pass train windows: `10`
- quality-pass eval windows: `10`
- dominant-beat-valid train windows: `10`
- dominant-beat-valid eval windows: `10`
- notch-valid train windows: `2`
- notch-valid eval windows: `0`

Practical reading:

- the rest branch is now target-complete at 2-subject smoke scope
- dominant-beat morphology is dense enough to support rest-branch plumbing and future smoke baselines
- notch timing remains a masked diagnostic target and should not drive rest decisions yet

## Verbalwm cohort-swap result

- Cohort-swap split:
  - train `sub-001`, `sub-010`, `sub-013`, `sub-015`
  - eval `sub-002`, `sub-007`, `sub-012`, `sub-035`
  - task `verbalwm`
- Artifact outputs:
  - `2048` paired windows
  - `2048 / 2048` quality-pass windows
  - dominant-beat-valid eval windows: `1020`
  - notch-valid eval windows: `20`
- Modeling result:
  - `eeg_clean_windows` remains the best branch
  - the branch still does not beat null on aggregate standardized MSE
  - but the failure is much smaller than on the reviewed broader split:
    - broader reviewed split aggregate standardized delta on `eeg_clean`: about `26.16`
    - cohort-swap aggregate standardized delta on `eeg_clean`: about `1.63`
  - `mean_ibi_seconds` now beats null on MSE for `eeg_clean`

Practical reading:

- removing `sub-016` and `sub-017` eliminates the catastrophic broader failure mode
- the remaining DS006848 problem is no longer mainly about bad-subject filtering
- the next blocker now looks like amplitude-family scale mismatch across subjects

## Protocol coverage

- `task-verbalwm`:
  - present for all `30` subjects
  - behavior files present for all `30` subjects
  - sampled behavior tables have `200` rows and conditions `Simultaneous`, `Fast`, `Slow`, and `Fast+delay`
  - sampled event tables contain rich event structure, including baseline, digit encoding, retention, retrieval, and experiment markers
- `task-rest`:
  - present for `22` subjects
  - the `8` missing-rest subjects match `participants.tsv -> RS_excluded=yes`
  - sampled rest event tables expose eyes-closed, eyes-opened, and cartoon markers

## Labels and benchmark fit

- Task labels present: yes
- Event labels present: yes
- Internal benchmark mapping:
  - `eeg_ppg_alignment`
  - `ppg_morphology_benchmark`
  - `rest_state_benchmark`
  - `cognitive_load_benchmark`
- Recommended accepted roles:
  - second public EEG-PPG paired benchmark
  - rest plus verbal working-memory protocol benchmark
  - PPG morphology and state-target benchmark

## Quality and exclusions

- Known quality fields:
  - `participants.EEG_excluded`
  - `participants.RS_excluded`
  - `participants.behavior_excluded`
  - `channels.status`
  - `channels.status_description`
- Known artifact fields:
  - no waveform-level artifact summary fields were confirmed in this pass
- Candidate exclusion rules:
  - use the full `30`-subject cohort for the first verbalwm benchmark
  - use only subjects with `RS_excluded=no` for the first rest benchmark
- Distribution shift notes:
  - subjects: `30`
  - verbalwm EEG+PPG cohort: `30`
  - rest EEG+PPG cohort: `22`
  - age range: `18-32`
  - sex distribution: `25F / 5M`
  - handedness: `24 right / 5 left / 1 both`

## Manifest updates required

- [x] modality metadata confirmed
- [x] counts populated at the source-tree and task-coverage level
- [x] first worksheet attached
- [x] ingest note attached
- [x] task naming corrected from generic working-memory to `verbalwm`
- [x] split plan attached
- [x] first verbalwm Phase 2 artifact built
- [x] first rest Phase 2 artifact built

## Acceptance decision

Current decision:

- keep as candidate

Decision rationale:

- the dataset is now source-backed enough to act as the second public EEG-PPG intake reference
- the shared BrainVision container simplifies the first EEG-PPG Phase 2 path relative to DS003838
- the remaining blocker is no longer modality ambiguity or first-artifact feasibility; it is deciding how far the new calibrated verbalwm path should be promoted and how the new rest pilot should grow

## Shift-aware cohort-swap result

- a short-calibration subject-zscore baseline now exists on the cohort-swap split
- best branch remains `eeg_clean_windows`
- zero-shot cohort-swap best-branch aggregate delta stays positive at about `+1.6269`
- `oracle_subject_zscore` still does not beat null, with aggregate delta about `+0.9083`
- `calibrated_subject_zscore` now edges past null on aggregate MSE, with delta about `-0.0083`
- first recovered targets in subject-normalized space:
  - `amplitude_range`
  - `rising_edge_slope_max`

Practical reading:

- short subject calibration matters more than simple cohort cleanup alone
- DS006848 now supports a plausible calibrated EEG-PPG path, not just a negative-check path

## Calibrated absolute cohort-swap result

- a short-calibration absolute-unit baseline now also exists on the cohort-swap split
- best branch remains `eeg_clean_windows`
- zero-shot best-branch aggregate relative MSE is about `1.6494`
- `oracle_absolute` still does not beat null, with aggregate relative MSE about `2.1795`
- `calibrated_absolute` now beats null, with aggregate relative MSE about `0.9238`
- first recovered targets in real units:
  - `amplitude_range`
  - `rising_edge_slope_max`
  - `dominant_beat_rise_time_seconds`

Practical reading:

- the DS006848 path is now stronger than a diagnostic-only calibration story
- the first broader DS006848-style null-beating result in real units now exists
- this is still a subject-calibrated result, not a zero-shot claim

## First one-subject calibrated expansion result

- a first one-subject calibrated expansion now exists on top of the cohort-swap path
- the expansion adds `sub-011` to eval while keeping the reviewed train side fixed
- the expanded data path stays fully clean:
  - `2304 / 2304` quality-pass windows
  - `1274` eval-valid dominant-beat windows
- the full calibrated morphology aggregate no longer beats null:
  - calibrated full aggregate relative MSE rises to about `2.1957`
- the family-level comparison now shows the break is concentrated in timing-style morphology:
  - amplitude-family aggregate relative MSE stays below null at about `0.9017`
  - timing-family aggregate relative MSE rises to about `4.1367`
- `sub-011` is the dominant new timing-family failure and should stay pending review for the default full-morphology calibrated cohort

## Second one-subject calibrated amplitude stress test

- a second one-subject calibrated amplitude stress test now exists on top of the same reviewed-train cohort
- the expansion adds `sub-025` to eval while keeping `sub-011` out
- the expanded data path stays fully clean:
  - `2304 / 2304` quality-pass windows
  - `1273` eval-valid dominant-beat windows
- the narrowed amplitude-family calibrated benchmark still beats null:
  - calibrated amplitude aggregate relative MSE is about `0.8753`
  - aggregate delta relative MSE is about `-0.1247`
- per-target reading stays consistent:
  - `amplitude_range` beats null
  - `rising_edge_slope_max` beats null
  - `dominant_beat_amplitude` remains slightly worse than null
- `sub-025` should stay pending for the default full-morphology calibrated cohort because waveform amplitude remains weak, but it no longer blocks the narrower amplitude-family benchmark

## First amplitude model-class comparison

- the first slightly richer nonlinear comparison now exists on the fixed DS006848 amplitude benchmark
- the comparison model is a calibrated median-heuristic RBF-kernel ridge baseline
- it was run on both:
  - the fixed cohort-swap benchmark
  - the `sub-025` amplitude stress-test expansion
- it does not beat the calibrated linear amplitude benchmark on either run
- both RBF runs stay near null:
  - cohort-swap aggregate relative MSE is about `0.9986`
  - cohort-plus-sub025 aggregate relative MSE is about `0.9986`
- the calibrated linear amplitude benchmark remains the active DS006848 benchmark

## First low-rank amplitude follow-on

- the first low-rank calibrated amplitude sweep now exists on the same fixed benchmark
- candidate ranks were `8, 16, 32, 64, 128, 256, 512`
- the best candidate is now:
  - branch `eeg_clean_windows`
  - rank `64`
- it improves over the full-resolution calibrated linear baseline on both accepted amplitude cohorts:
  - cohort-swap aggregate relative MSE improves from about `0.8743` to about `0.8680`
  - cohort-plus-sub025 aggregate relative MSE improves from about `0.8753` to about `0.8691`
- the active DS006848 amplitude benchmark should now move from full-resolution calibrated linear to low-rank rank-64 calibrated linear

## First subject-conditioned residual follow-on

- the first residual-style follow-on now exists on top of the active low-rank DS006848 amplitude benchmark
- it kept the same:
  - accepted amplitude cohorts
  - `eeg_clean_windows` branch
  - rank `64`
  - `32`-window short-calibration contract
- it added a simple per-subject residual-bias correction estimated from the calibration windows
- it fails on both accepted amplitude cohorts and degrades all tracked targets
- cohort-swap aggregate relative MSE worsens from about `0.8680` to about `1.3670`
- cohort-plus-sub025 aggregate relative MSE worsens from about `0.8691` to about `1.3674`
- subject-conditioned residual correction should therefore now be treated as completed negative evidence, not the next default DS006848 lever

## First Haar-wavelet follow-on

- the first transient-aware feature-view follow-on now also exists on top of the active low-rank DS006848 amplitude benchmark
- it kept the same:
  - accepted amplitude cohorts
  - calibrated low-rank linear family
  - `32`-window short-calibration contract
- it replaced raw `eeg_clean_windows` with a full `7`-level Haar decomposition over the `128`-sample time axis
- it does not beat the active low-rank baseline on either accepted amplitude cohort
- the best Haar candidate is `rank 8`
- aggregate relative MSE stays just above null on both accepted cohorts:
  - cohort-swap: about `1.0168`
  - cohort-plus-sub025: about `1.0167`
- higher Haar ranks become sharply unstable, so this exact full-basis wavelet view should also now be treated as completed negative evidence

## First channel-preserving detail-summary follow-on

- the first selective transient-aware feature-view follow-on now also exists on top of the active low-rank DS006848 amplitude benchmark
- it kept the same:
  - accepted amplitude cohorts
  - calibrated low-rank linear family
  - `32`-window short-calibration contract
- it replaced raw `eeg_clean_windows` with per-channel multiscale detail summaries:
  - detail `rms`
  - detail `max_abs`
  - final approximation scalar
- this view is materially better than the full Haar rotation and slightly beats the null aggregate on both accepted amplitude cohorts
- the best candidate is `rank 256`
- aggregate relative MSE is:
  - cohort-swap: about `0.9902`
  - cohort-plus-sub025: about `0.9903`
- it still does not beat the active raw low-rank baseline, so it should be treated as useful secondary evidence, not the new DS006848 default

## First hybrid raw-plus-detail follow-on

- the first raw-plus-detail feature-view follow-on now also exists on top of the active low-rank DS006848 amplitude benchmark
- it kept the same:
  - accepted amplitude cohorts
  - calibrated low-rank linear family
  - `32`-window short-calibration contract
- it concatenated raw `eeg_clean_windows` with the channel-preserving multiscale detail summaries
- this becomes the first DS006848 follow-on to beat the active raw low-rank baseline on both accepted amplitude cohorts
- the best candidate is `rank 512`
- aggregate relative MSE improves to:
  - cohort-swap: about `0.7631`
  - cohort-plus-sub025: about `0.7658`
- all three tracked amplitude targets now beat the null on both accepted amplitude cohorts, including `dominant_beat_amplitude`
- the active DS006848 amplitude benchmark should now move to the hybrid raw-plus-detail rank-512 baseline

## First timing-heavy hybrid amplitude expansion

- the first timing-heavy amplitude expansion for the hybrid raw-plus-detail benchmark now also exists
- this uses the `sub-011` amplitude expansion that previously marked the boundary for the older amplitude benchmark
- on that same split:
  - calibrated absolute raw `eeg_clean` is about `0.9017`
  - calibrated low-rank raw `eeg_clean` is about `0.8954`
  - the best hybrid candidate improves further to about `0.7797`
- the best hybrid rank on this split is `16`
- the fixed active hybrid rank `512` also stays below null at about `0.8178`
- all three tracked amplitude targets stay below null under the best hybrid candidate, including `dominant_beat_amplitude`
- the amplitude-only question is now answered: the hybrid gain survives the timing-heavy `sub-011` expansion

## Next actions

1. Keep the broader slice-analysis pass and explicit subject-quality policy as the reference for what to watch: amplitude-family concentration, eval quality attrition, and subject-specific failure.
2. Treat the first cohort-swap pass as complete:
   - `sub-002` and `sub-035` are cleaner than `sub-016` and `sub-017`
   - that swap removes the catastrophic failure mode
   - short calibration on top of that swap now does recover a null-beating DS006848 baseline in real units
3. Treat the first one-subject expansion as a boundary marker:
   - `sub-011` should not yet be promoted into the default full-morphology calibrated cohort
   - amplitude-family calibrated behavior is more stable than the full morphology aggregate under this expansion
4. Treat the `sub-025` amplitude stress test as confirmation that the narrowed amplitude-family benchmark is now stable under both timing-heavy and weak-amplitude subject expansions.
5. Freeze the narrowed DS006848 amplitude-family calibrated benchmark as the active development benchmark.
6. Treat the first generic nonlinear comparison as completed negative evidence:
   - naive RBF kernelization is not the next lever
7. Treat the first low-rank comparison as completed positive evidence:
   - rank-64 `eeg_clean` is now the best DS006848 amplitude baseline
8. Treat the first subject-conditioned residual comparison as completed negative evidence:
   - simple residual-bias correction is not the next lever
9. Treat the first full Haar-wavelet comparison as completed negative evidence:
   - a generic full-basis Haar rotation is not the next lever either
10. Treat the first channel-preserving detail-summary comparison as weak positive secondary evidence:
   - selective multiscale summaries recover some real signal, but not enough to replace the raw low-rank baseline
11. Treat the first hybrid raw-plus-detail comparison as completed positive evidence:
   - hybrid raw `eeg_clean` plus channel-preserving detail summaries is now the best DS006848 amplitude baseline
12. Treat the first timing-heavy hybrid amplitude expansion as completed positive evidence:
   - the hybrid amplitude gain survives `sub-011`
13. Test whether the same hybrid feature view helps the broader timing-family and full-morphology `sub-011` failure before promoting `sub-011` into the default full-morphology cohort.
14. Decide whether the rest branch should stay a smoke contract or expand into a real rest benchmark now that the first rest target artifact exists.

## Commands

```powershell
python scripts/cross_modal/validate_manifest_file.py manifests/cross_modal/public_ds006848.json
python scripts/cross_modal/validate_registry.py --registry manifests/cross_modal/registry.json
```
