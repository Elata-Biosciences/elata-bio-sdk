## Multi-Modality And rPPG Integration Plan

Status: draft

### Goal

Support heterogeneous biosignal devices (EEG, PPG, fNIRS, IMU, etc.) and clearly
separate:

- **PPG**: raw optical pulse data from a sensor (on skin or in a composite
  headset), and
- **rPPG**: remote PPG inferred from video frames (camera-only or hybrid).

Consumers should:

- talk to a **single, stable SDK surface** for biosignals,
- be able to swap devices (Muse, BrainBit, future headsets) with minimal code
  changes, and
- choose between **hardware PPG**, **camera-based rPPG**, or **hybrid** flows
  without re-learning the stack.

---

### Phase 1 – Define Multi-Modality Contracts

**Objective:** Introduce a device-agnostic, modality-aware contract in
TypeScript that all integrations can target.

**Tasks:**

- Add a small TS core module (either a new package or a well-scoped module in
  the web packages) that defines:
  - `SensorModality = 'eeg' | 'ppg' | 'rppg' | 'fnirs' | 'imu' | 'accel' |
    'gyro' | 'temp' | ...`
  - `BiosignalDeviceInfo`:
    - `id`, `label`, `vendor`, `model`
    - `modalities: SensorModality[]`
    - per-modality sampling rates and channel metadata where applicable.
  - `BiosignalDevice`:
    - lifecycle: `connect()`, `disconnect()`
    - events/streams per modality:
      - `onEegSample?(handler: (sample: EegSample) => void)`
      - `onPpgSample?(handler: (sample: PpgSample) => void)`
      - `onFnirsSample?(handler: (sample: FnirsSample) => void)`
      - `onImuSample?(handler: (sample: ImuSample) => void)`
      - generic `onError`, `onStatusChange`.
- Define normalized sample types:
  - `EegSample` (channels, sample rate, timestamp, units).
  - `PpgSample` (channel id, raw value, filtered value, timestamp).
  - `FnirsSample` (HbO/HbR per channel, timestamp).
  - `ImuSample` (accel/gyro vectors, timestamp).
- Explicitly **separate rPPG** types from PPG:
  - `RppgEstimationInput` (video frames + optional PPG priors).
  - `RppgEstimation` (heart rate, confidence, signal quality metrics).
  - Make it clear in docs and types that `rppg` is a *derived modality*, not a
    raw sensor.

**Deliverables:**

- Core TS contracts in a dedicated module (e.g.
  `packages/eeg-web/src/biosignal-core.ts` or
  `@elata-biosciences/biosignal-core`).
- Maintainer notes describing which types are **public and stable**.

---

### Phase 2 – Align Existing Packages To Contracts

**Objective:** Make current web packages consume/produce the new contracts
without breaking existing apps.

**Tasks:**

- `@elata-biosciences/eeg-web`:
  - Accept any `BiosignalDevice` that exposes EEG:
    - e.g. `createEegClient({ device })` where `device.info.modalities`
      includes `'eeg'`.
  - Internally adapt `EegSample` streams into existing WASM pipelines.
  - Keep current exports for band powers and models; update their input types to
    the normalized EEG contracts.
- `@elata-biosciences/eeg-web-ble` (or successor Muse-specific package):
  - Refactor into a device package that implements `BiosignalDevice`:
    - Map Muse BLE packets to `EegSample` (and PPG, if hardware supports it).
    - Set `modalities` appropriately, e.g. `['eeg']` or `['eeg', 'ppg']`.
  - Keep the existing public name as a thin compatibility layer if needed.
- `@elata-biosciences/rppg-web`:
  - Make the distinction explicit:
    - Input is **video (and optionally PPG)**, not arbitrary sensor streams.
    - Outputs are `RppgEstimation` values at lower frequency than raw PPG.
  - Provide helpers to:
    - run rPPG purely from video, and
    - run **hybrid** rPPG where camera and PPG co-exist.

**Deliverables:**

- Updated package internals and type definitions that rely on shared
  multi-modality contracts.
- No breaking changes to surface APIs unless a major bump is explicitly chosen.

---

### Phase 3 – Device Packages For Composite Hardware

**Objective:** Model composite devices (e.g. EEG + PPG + fNIRS) cleanly and
connect them to the processing stack.

**Tasks:**

- Define a naming convention for device integrations:
  - `@elata-biosciences/device-muse-ble`
  - `@elata-biosciences/device-brainbit-ble`
  - `@elata-biosciences/device-<vendor>-<transport>`
- For each device package:
  - Implement `BiosignalDevice` against the shared contracts.
  - Normalize channel layouts (EEG, PPG, fNIRS) into the standard types.
  - Expose small factories:
    - `createMuseBleDevice()`
    - `createBrainbitBleDevice()`
- For composite devices:
  - Ensure `modalities` lists all supported sensors.
  - Provide convenience methods or metadata for common combos:
    - e.g. `device.info.modalities` contains both `'eeg'` and `'ppg'` and
      supports syncing streams by timestamp.

**Deliverables:**

- At least one non-Muse device package (e.g. BrainBit) wired into the shared
  contracts.
- Example code showing:
  - swapping devices with minimal changes, and
  - consuming multiple modalities from a single device instance.

---

### Phase 4 – rPPG Pipeline Positioning

**Objective:** Place rPPG clearly in the stack as a *derived* estimation layer
that can optionally fuse with hardware PPG.

**Tasks:**

- Clarify architecture:
  - rPPG lives in the **models/estimation layer**, not the raw sensor layer.
  - It consumes:
    - video frames (required), and
    - optional priors from PPG or IMU streams.
- In `@elata-biosciences/rppg-web`:
  - Define `RppgProcessor` that:
    - accepts `RppgEstimationInput` (video frames + optional hints).
    - emits `RppgEstimation` at a configurable cadence.
  - Add optional integration points:
    - ability to subscribe to `PpgSample` streams from a `BiosignalDevice` and
      fuse them into estimation.
- Update rPPG docs:
  - explain difference between:
    - **PPG**: direct sensor readings.
    - **rPPG**: computer-vision-based estimation.
  - describe trade-offs:
    - robustness, latency, privacy, and hardware requirements.

**Deliverables:**

- Updated `architecture-rppg.md` to reference the multi-modality contracts.
- rPPG package docs that show both camera-only and hybrid (camera + PPG) flows.

---

### Phase 5 – Examples, Templates, And Demos

**Objective:** Make multi-modality + rPPG usage discoverable and testable from
scaffolded apps and examples.

**Tasks:**

- Add or update demo templates to include:
  - EEG-only demo using a `BiosignalDevice` (Muse, BrainBit, etc.).
  - rPPG-only demo (camera-only) with clear permissions flows.
  - Hybrid demo that:
    - streams EEG and PPG from a composite device, and
    - runs rPPG from camera simultaneously or as a fallback.
- Update `create-elata-demo` templates:
  - expose template choices by modality:
    - `eeg-only`, `rppg-only`, `eeg+ppg`, `eeg+rppg`.
  - ensure generated README explains which sensors are needed and how they map
    to the contracts.
- Extend CI smoke tests:
  - build and type-check all new templates.
  - run minimal runtime smoke for rPPG (e.g. WASM loading, mock frames, not
    full camera in CI).

**Deliverables:**

- New or updated demo templates and generated READMEs.
- CI coverage for multi-modality and rPPG flows.

---

### Phase 6 – Stability, Versioning, And Migration

**Objective:** Keep multi-modality contracts and rPPG APIs stable as the engine
evolves.

**Tasks:**

- Mark core contracts as **public and stable**:
  - `BiosignalDevice`, modality enums, normalized sample types.
  - `RppgEstimation` and key rPPG entry points.
- Document:
  - which fields are required vs optional,
  - how to extend with new modalities without breaking old ones.
- Add migration guidance for:
  - existing apps that used older, device-specific types.
  - apps that need to move from single-modality (EEG-only) to composite flows.
- Update the SDK adoption plan to:
  - reference the new multi-modality docs.
  - list “multi-modality + rPPG stability” as a tracked surface.

**Deliverables:**

- Stability notes in `docs/` and a short section in the root README.
- A migration section in each affected package README where public types change.

---

### Recommended Order

1. Phase 1: Define multi-modality and rPPG contracts.
2. Phase 2: Align existing EEG and rPPG packages to the contracts (no new
   devices yet).
3. Phase 3: Add at least one composite device package (e.g. BrainBit).
4. Phase 4: Clarify rPPG’s place in the architecture and expose hybrid flows.
5. Phase 5: Update demos, scaffolders, and CI smoke tests.
6. Phase 6: Codify stability and provide migration guidance.

