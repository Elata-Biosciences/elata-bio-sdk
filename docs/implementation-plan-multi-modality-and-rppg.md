## Multi-Modality And rPPG Integration Plan

Status: draft

### Goal

Support heterogeneous biosignal hardware and camera-derived estimators through
one stable abstraction that can handle:

- one device with many modalities, such as Athena S with EEG plus optical data,
- many devices at once, such as one EEG headset plus one fNIRS unit plus one
  camera, and
- a clear separation between raw sensor streams and derived estimators.

The main design choice is:

- **abstract around sources and streams, not around one device-specific frame**

This keeps Athena support clean without making Athena the center of the whole
SDK.

---

### Current Repo Reality

The repo already has two useful but different shapes:

- `@elata-biosciences/eeg-web-ble` emits a single normalized headband frame that
  can contain `eeg`, `ppgRaw`, `optics`, `accgyro`, and `battery`.
- `@elata-biosciences/rppg-web` is session-oriented and owns camera capture,
  ROI, diagnostics, and lifecycle.
- the Rust HAL is still explicitly EEG-oriented and single-device.

That means the repo already supports:

- **multi-modality within one source**, and
- **managed sessions for derived camera processing**

But it does **not** yet have a first-class abstraction for:

- multiple physical sources at once,
- non-headband modalities such as fNIRS alongside EEG, or
- a shared app-level aggregator that can reason across many transports.

So the plan should add a new layer **above** the current headband/session
surfaces instead of trying to overload them.

---

### Proposed Core Model

#### 1. Source

A **Source** is one runtime producer of biosignal data.

Examples:

- one Athena headset
- one standalone fNIRS device
- one camera-backed rPPG session
- one synthetic bridge used for tests

Recommended fields:

- `sourceId`
- `sourceName`
- `kind`: `wearable`, `camera`, `fnirs`, `bridge`, `synthetic`, `custom`
- optional vendor/model/transport metadata

#### 2. Stream

A **Stream** is one modality-specific channel group emitted by a source.

Examples:

- Athena source:
  - `eeg`
  - `ppgRaw` or `optics`
  - `accgyro`
  - `battery`
- fNIRS source:
  - `fnirs_raw`
  - optional derived `hbo`
  - optional derived `hbr`
- camera source:
  - `rppg_signal`
  - optional `rppg_metrics`

Recommended fields:

- `streamId`
- `modality`: `eeg`, `ppg`, `optics`, `fnirs`, `accgyro`, `battery`, `rppg`, `derived`
- channel metadata
- sample rate when stable
- clock source and units metadata where needed

#### 3. Block

A **Block** is one emitted chunk of samples for one stream from one source.

Use one generic block shape for transport and processing boundaries:

```ts
type BiosignalModality =
  | "eeg"
  | "ppg"
  | "optics"
  | "fnirs"
  | "accgyro"
  | "battery"
  | "rppg"
  | "derived";

interface BiosignalBlockV1 {
  schemaVersion: "v1";
  sourceId: string;
  streamId: string;
  modality: BiosignalModality;
  emittedAtMs: number;
  sampleRateHz?: number;
  channelNames: string[];
  channelCount: number;
  samples: number[][];
  timestampsMs?: number[];
  clockSource?: "device" | "local" | "derived";
  metadata?: Record<string, unknown>;
}
```

Important rule:

- blocks are **per stream**, not one giant “everything from the device right
  now” envelope

That makes it much easier to:

- merge many devices,
- buffer each modality independently,
- process different sample rates cleanly, and
- add new modalities without changing every consumer.

**Typing strategy:** `samples` as `number[][]` plus `channelNames`, `modality`,
and `metadata` is intentional: the shared shape stays a portable transport and
rig boundary. For ergonomic pipelines, add **narrowing helpers or views** at the
edge of a package (for example map an EEG block into existing WASM-facing types,
or map `modality === "rppg"` blocks into current rPPG result structs) instead of
encoding every modality’s sample layout in the shared interface. Keep richer
domain types **package-local or app-local** until a second consumer needs the
same shape; then promote the minimum stable slice into shared contracts.

#### 4. Rig / Multi-Source Session

A **Rig** or **MultiSourceSession** is the app-level fan-in layer.

Responsibilities:

- attach many sources
- subscribe to normalized blocks and statuses
- expose source registry and capabilities
- coordinate connect/start/stop across sources
- optionally offer time-alignment helpers

Non-responsibilities:

- raw transport decoding
- camera ROI logic
- signal fusion math

Those stay inside source adapters and processing packages.

---

### How Athena S Fits

Athena S should be modeled as:

- **one source**
- with **multiple streams**

Recommended mapping:

- `sourceId: "athena-1"`
- streams:
  - `eeg`
  - `ppgRaw` or `optics`
  - `accgyro`
  - `battery`

This preserves what the repo already does well today: one transport can expose
many sensor families together.

What should **not** happen:

- do not invent an Athena-specific top-level abstraction
- do not force fNIRS or camera flows into a headband-shaped frame
- do not make multi-device logic depend on “the primary headset”

Athena is a strong example source, but not the architecture center.

---

### How Multi-Device Setups Fit

A multi-device experiment should look like this:

- `athena-1` source
  - `eeg`
  - `optics`
  - `accgyro`
- `fnirs-1` source
  - `fnirs_raw`
  - optional `hbo`
  - optional `hbr`
- `camera-1` source
  - `rppg_signal`
  - optional `rppg_metrics`

The rig aggregates all three.

This gives the app one stable pattern:

- enumerate sources
- inspect their streams
- subscribe to blocks by `sourceId`, `streamId`, or `modality`

Instead of:

- branching on every device family
- asking whether one transport “also has” another modality
- coupling app logic to package-specific frame layouts

---

### PPG vs rPPG

This distinction needs to stay explicit.

#### PPG

PPG is:

- direct optical pulse data from hardware
- a raw or near-raw sensor stream
- usually high-rate and device-clocked

Examples:

- Athena optics values
- a finger clip sensor
- LED/photodiode channels from a wearable

#### rPPG

rPPG is:

- a camera-derived estimator
- not a raw hardware stream
- lower-rate, quality-sensitive, and often accompanied by diagnostics

Examples:

- face video processed into pulse intensity or BPM candidates
- camera plus IMU or hardware PPG assisted estimation

Design consequence:

- `rppg` belongs in the same multi-source world, but it should usually be
  treated as a **derived stream or processor output**, not a substitute for
  raw hardware PPG types

---

### Contract Recommendation

The repo should introduce one small TypeScript module for shared contracts.

Recommended shape:

```ts
interface BiosignalSourceInfo {
  sourceId: string;
  sourceName: string;
  kind: "wearable" | "camera" | "fnirs" | "bridge" | "synthetic" | "custom";
  manufacturer?: string;
  model?: string;
  transport?: string;
  streams?: BiosignalStreamDescriptor[];
  metadata?: Record<string, unknown>;
}

interface BiosignalSourceStatus {
  sourceId: string;
  state:
    | "idle"
    | "connecting"
    | "connected"
    | "streaming"
    | "degraded"
    | "reconnecting"
    | "disconnected"
    | "error";
  atMs: number;
  reason?: string;
  errorCode?: string;
  recoverable?: boolean;
  metadata?: Record<string, unknown>;
}

interface BiosignalSource {
  readonly sourceInfo: BiosignalSourceInfo;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribeBlock(listener: (block: BiosignalBlockV1) => void): () => void;
  subscribeStatus(listener: (status: BiosignalSourceStatus) => void): () => void;
}
```

Why `subscribeBlock()` instead of one `onBlock` property:

- it composes better with adapters
- it avoids handler clobbering
- it makes a rig implementation straightforward

---

### Contract versioning

- Use `schemaVersion` on `BiosignalBlockV1` (and successors) as the explicit
  compatibility switch. Consumers should reject, bridge, or degrade gracefully
  on unknown versions rather than assuming layout.
- Prefer **additive** changes (new optional fields, new `modality` enum members
  with documented semantics) within a schema version. If a layout or meaning
  break is unavoidable, introduce `v2` (or higher) and keep adapters for at
  least one release cycle where practical.
- When contracts ship publicly, mark **stable vs experimental** exports in the
  owning package README. Reserve major version bumps for renames or semantic
  breaks, not for every new optional field.

---

### Package Plan

#### Phase 1: Add Shared Contracts

Target:

- add the shared biosignal contracts in one well-scoped TS module

Recommended placement:

- `packages/eeg-web/src/` as the first home for shared browser-side contracts

Reason:

- `eeg-web` already carries shared browser contracts used by higher-level
  packages
- this keeps the first pass small and avoids introducing a whole new package

Deliverables:

- `BiosignalSourceInfo`
- `BiosignalSourceStatus`
- `BiosignalBlockV1`
- `BiosignalSource`
- `MultiSourceSession` or equivalent rig helper

#### Phase 2: Add Adapters, Not Breaks

Target:

- adapt current surfaces into the new contracts without replacing them

Recommended adapters:

- `BleTransport` -> `BiosignalSource`
- `RppgSession` -> `BiosignalSource`

Important:

- keep current `HeadbandTransport` and `createRppgSession()` entry points
- the new abstraction is additive first

#### Phase 3: Generalize Beyond Headbands

Target:

- add an fNIRS source adapter that emits `fnirs` blocks directly

Important:

- do not route fNIRS through headband-specific types
- do not make EEG required in the shared block contract

#### Phase 4: Time Alignment Helpers

Target:

- add optional rig-level helpers for aligning streams from many clocks

Possible helpers:

- choose preferred clock domain
- estimate offset/drift
- build merged windows for downstream models

Important:

- keep this optional and above raw source adapters

#### Phase 5: Fusion And App Surfaces

Target:

- let processors consume many streams without owning transport

Examples:

- EEG + fNIRS fusion
- camera rPPG + hardware PPG comparison
- IMU-assisted quality gating

---

### Rust Side Guidance

The current Rust HAL should not be stretched into this whole problem in one
step.

Current reality:

- it is explicitly EEG-focused
- it is single-device oriented

Recommendation:

- keep the existing EEG HAL intact for EEG-specific processing
- if native multi-device support is needed later, add a new layer above it
  rather than mutating `EegDevice` into a universal biosignal trait too early

That keeps the web-side abstraction work decoupled from a large Rust refactor.

---

### Non-Goals For The First Iteration

- no full fusion engine
- no hard commitment yet on derived metrics schemas beyond what is needed for
  source/stream/block contracts
- no mandatory migration off `HeadbandFrameV1`
- no forced rename of existing packages
- no new device package taxonomy until the shared source contract proves out

---

### Recommended Order

1. Add the shared source/stream/block contracts.
2. Add adapters for existing `BleTransport` and `RppgSession`.
3. Add a rig helper that can aggregate many sources.
4. Add one non-headband source, ideally fNIRS, to prove the abstraction is not
   headband-centric.
5. Add time-alignment helpers only after at least two real sources exist.
6. Update demos and guides after the adapter layer is stable.

---

### Decision Summary

The core decision is:

- **one physical producer = one source**
- **one modality channel group = one stream**
- **one emitted sample chunk = one block**
- **many sources together = one rig**

That is the abstraction that should carry Athena S, fNIRS, PPG, EEG, and rPPG
forward together without turning the SDK into device-specific branching.
