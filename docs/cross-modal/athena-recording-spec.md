# Athena Recording Specification

Status: Active pilot contract with live SDK recorder

## Purpose

This note defines the repo-local Phase 1 contract for Athena intake.

It is not a claim that Athena internal recordings are fully verified already.
It is the minimum standardized export shape the repo now expects before real Athena captures enter Phase 1 and Phase 2.

The repo now also has a browser recorder path that uses the SDK directly to create these exports from live Athena sessions.

## Confirmed transport facts from local code

The repo already confirms:

- Athena EEG transport uses `8` channels at `256 Hz`
- Athena optics transport uses `64 Hz` packets with `4`, `8`, or `16` channel variants
- Athena IMU transport uses `6` channels at `52 Hz`
- battery samples are exposed on the Athena auxiliary path
- Athena EEG device timestamps are exposed through the current BLE transport path
- Athena PPG is not yet confirmed on the current SDK-backed transport path

Current local references:

- `crates/muse-proto/src/athena.rs`
- `packages/eeg-web-ble/src/museDevice.ts`
- `packages/eeg-web-ble/src/bleTransport.ts`
- `crates/eeg-wasm/src/athena.rs`
- `eeg-demo/athena-recorder.html`

## Pilot export layout

The Athena prep path now expects a capture root shaped like:

```text
<capture_root>/
  <subject_id>/
    <session_id>/
      athena_session.json
      eeg.csv
      fnirs_optics.csv
      imu.csv
      battery.csv
      ppg.csv
```

The exact file extensions are not the important part.
The important part is that each session directory has one authoritative `athena_session.json` sidecar and that every modality path recorded there exists on disk.

`ppg.csv` is optional for live Athena recorder exports.
If the SDK transport does not expose Athena PPG, the sidecar must mark `ppg.present = false` instead of inventing a file.

## Required session sidecar fields

Each `athena_session.json` must include:

- `subject_id`
- `session_id`
- `protocol`
- `task_label`
- `timestamp_source`
- `modalities`

For each required modality block:

- `present`
- `relative_path`
- `feature_dim`
- `sampling_rate_hz` when known
- `geometry_available`

Current live-recorder default:

- required: `eeg`, `fnirs`
- optional: `ppg`, `imu`, `battery`

Recommended session-sidecar shape:

```json
{
  "subject_id": "athena-sub-001",
  "session_id": "ses-2026-04-10-rest",
  "protocol": "rest_eyes_open",
  "task_label": "rest",
  "timestamp_source": "athena_shared_clock",
  "labels": {
    "task_labels_present": true,
    "event_labels_present": false,
    "ppg_morphology_targets_present": false
  },
  "shift_metadata": {
    "age_band": "30-39",
    "recent_caffeine": false,
    "recent_exercise": false,
    "artifact_burden": "low"
  },
  "quality_fields": ["sync_confidence", "eeg_contact_score", "ppg_clean_std"],
  "artifact_fields": ["motion_score", "clip_fraction"],
  "modalities": {
    "eeg": {
      "present": true,
      "relative_path": "eeg.csv",
      "sampling_rate_hz": 256.0,
      "feature_dim": 8,
      "geometry_available": true,
      "verification_status": "confirmed_from_local_code"
    },
    "fnirs": {
      "present": true,
      "relative_path": "fnirs_optics.csv",
      "sampling_rate_hz": 64.0,
      "feature_dim": 8,
      "geometry_available": true,
      "transport_signal": "optics",
      "processing_status": "pending_internal_pipeline"
    },
    "ppg": {
      "present": false,
      "sampling_rate_hz": null,
      "feature_dim": 0,
      "geometry_available": false,
      "mapping_status": "not_exposed_by_current_athena_sdk"
    },
    "imu": {
      "present": true,
      "relative_path": "imu.csv",
      "sampling_rate_hz": 52.0,
      "feature_dim": 6,
      "geometry_available": false
    },
    "battery": {
      "present": true,
      "relative_path": "battery.csv",
      "sampling_rate_hz": null,
      "feature_dim": 1,
      "geometry_available": false
    }
  }
}
```

## Phase 1 acceptance criteria

Athena should not be treated as Phase 1 complete until real internal captures confirm:

- subject/session storage layout
- timestamp source and drift behavior
- exact optical-to-fNIRS derivation path
- exact PPG layout or derivation path
- task and event label export behavior

## Phase 2 handoff criteria

Athena should not be treated as ready for the first real Phase 2 public-style windowing pass until:

- at least `2` real subjects and `2` to `3` real sessions have passed the sidecar contract
- synchronization confidence is logged in the session exports
- EEG and optics/fNIRS paths are materially present in the same sessions
- either Athena PPG is confirmed on the live SDK path or the downstream plan explicitly accepts a no-PPG intake stage
- one real Athena pilot report exists with actual counts instead of fixture counts

## Current runnable path

The repo now has a fixture-backed Athena prep command:

```powershell
python scripts/cross_modal/prepare_athena_dataset.py --config configs/cross_modal/athena_prepare_fixture.toml
python scripts/cross_modal/validate_manifest_file.py reports/cross_modal/athena/athena_internal_fixture_manifest.json
```

This command is intentionally modest.
It de-risks the Athena intake contract and manifest/report plumbing before real internal data is mounted.

The repo also now has a live SDK recorder path:

```powershell
npm run cross-modal:athena:recorder:serve
```

Then open `http://127.0.0.1:4173/athena-recorder.html` and export a capture into your chosen root.

If you export into `data/athena_live_capture`, you can prepare the live intake manifest with:

```powershell
npm run cross-modal:athena:prepare:live
```

## Related files

- [athena-intake-note.md](athena-intake-note.md)
- [../../configs/cross_modal/athena_prepare_live.toml](../../configs/cross_modal/athena_prepare_live.toml)
- [../../configs/cross_modal/athena_prepare_fixture.toml](../../configs/cross_modal/athena_prepare_fixture.toml)
- [../../manifests/cross_modal/athena_internal.template.json](../../manifests/cross_modal/athena_internal.template.json)
- [../../reports/cross_modal/intake/athena-internal-pilot-report.md](../../reports/cross_modal/intake/athena-internal-pilot-report.md)
