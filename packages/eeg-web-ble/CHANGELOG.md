# Changelog

All notable changes to `@elata-biosciences/eeg-web-ble` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2024-01-01

### Added

- Initial public release of the Web Bluetooth Muse transport.
- `BleTransport` implementing `HeadbandTransport` with status callbacks.
- `MuseBleDevice` with classic and Athena protocol support.
- EEG, PPG, optics, accelerometer/gyroscope, and battery frame emission.
- Interleaved and per-channel PPG decoding.
