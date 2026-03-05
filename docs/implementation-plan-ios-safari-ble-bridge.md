# Implementation Plan: Safari/iOS Muse BLE Bridge

## Goal

Enable Muse headset streaming on Safari/iOS by moving BLE transport into native iOS (`CoreBluetooth`) while preserving the existing `HeadbandFrameV1` contract used by web consumers.

## Scope

- iOS native BLE transport for Muse classic + Athena-capable devices.
- Bridge native frames into a web UI hosted in `WKWebView`.
- Keep frame schema compatible with `@elata/eeg-web` (`HeadbandFrameV1`).
- Preserve status semantics similar to `HeadbandTransportState`.

Out of scope for first release:

- Android native bridge parity.
- Background streaming with full app lifecycle hardening.
- Full multi-device support beyond Muse-family targets.

## Architecture

1. BLE layer (`CoreBluetooth`)
- Discover/connect Muse service and characteristics.
- Implement classic and Athena routing logic mirroring `packages/eeg-web-ble/src/museDevice.ts`.

2. Decode/normalize layer
- Decode raw packets into channelized samples.
- Build normalized frame payloads matching `HeadbandFrameV1`.
- Produce status events matching existing transport states.

3. Web bridge layer (`WKWebView`)
- Native -> Web: push `HeadbandFrameV1` JSON via `evaluateJavaScript` or `WKScriptMessage`.
- Web -> Native: command channel for `connect`, `start`, `stop`, `disconnect`.

4. JS adapter layer
- Add a transport adapter that implements the `HeadbandTransport` interface on top of the iOS bridge.
- Reuse existing downstream processing unchanged.

## Milestones

### M1: Native BLE Skeleton
- Create iOS module with connection lifecycle and characteristic discovery.
- Emit status events for connecting/connected/disconnected/error.
- Acceptance: connect/disconnect from Muse reliably on iOS device.

### M2: Classic Streaming Path
- Implement classic EEG packet parsing and optional PPG handling.
- Emit valid `HeadbandFrameV1` (`eeg`, optional `ppgRaw`).
- Acceptance: continuous frames visible in web UI with stable channel counts.

### M3: Athena Streaming Path
- Integrate Athena decode pipeline in native path.
- Emit auxiliary blocks (`optics`, `accgyro`, `battery`) when present.
- Acceptance: Athena frames decoded and surfaced with expected schema fields.

### M4: JS Transport Adapter
- Implement web-side adapter with `connect/start/stop/disconnect`.
- Map native status/events into existing `HeadbandTransport` callbacks.
- Acceptance: existing app code can swap to iOS bridge transport with minimal wiring.

### M5: Reliability + Packaging
- Add reconnection behavior, error codes, and basic telemetry logs.
- Add smoke tests (native + JS contract tests for schema).
- Acceptance: 30-minute session without fatal disconnect loops; schema validation passes.

## API Contract

Native event payloads should include:

- `type`: `status` | `frame` | `error`
- `payload`:
  - for `frame`: full `HeadbandFrameV1` JSON
  - for `status`: `{ state, atMs, reason?, errorCode?, recoverable? }`
  - for `error`: `{ code, message, recoverable }`

Web command payloads should include:

- `connect`, `start`, `stop`, `disconnect`
- optional config: source name, protocol hints, decoder mode

## Test Plan

1. Contract tests
- Validate emitted frame JSON against expected `HeadbandFrameV1` shape.
- Validate status transition sequence.

2. Device tests
- Muse 2 or Muse S classic session.
- Athena-capable session (if device available).

3. Regression checks
- Ensure web processing (`@elata/eeg-web`, downstream metrics) runs unchanged with bridged frames.

## Risks and Mitigations

- Firmware command variance:
  - Mitigate with command fallback table and feature detection.
- iOS lifecycle interruptions:
  - Mitigate with explicit resume/reconnect state machine.
- Clock/timestamp drift:
  - Mitigate by standardizing timestamp source and including clock metadata.

## Deliverables

- iOS BLE bridge module with documented command/event protocol.
- JS adapter implementing `HeadbandTransport`.
- Integration notes for app teams embedding `WKWebView`.
- Validation checklist for supported Muse models/firmware.

