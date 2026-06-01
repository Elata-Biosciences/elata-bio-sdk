# Changelog

## 0.2.1

### Patch Changes

- d1615d6: Ship `llms.txt` in each published package for AI/tooling context, include the
  scaffolder README in the npm tarball, and add concise TSDoc on primary entry
  points so declarations surface in IDEs and `.d.ts` consumers.
- Updated dependencies [d1615d6]
- Updated dependencies [7fed52d]
  - @elata-biosciences/eeg-web@0.2.1

All notable changes to `@elata-biosciences/eeg-web-ble` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## Unreleased

### Changed

- Reorganized sources: `src/transport/bleTransport.ts` and
  `src/devices/muse/museDevice.ts`. Public exports are unchanged — continue to
  import from `@elata-biosciences/eeg-web-ble` only.

## [0.1.0] - 2024-01-01

### Added

- Initial public release of the Web Bluetooth Muse transport.
- `BleTransport` implementing `HeadbandTransport` with status callbacks.
- `MuseBleDevice` with classic and Athena protocol support.
- EEG, PPG, optics, accelerometer/gyroscope, and battery frame emission.
- Interleaved and per-channel PPG decoding.
