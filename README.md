# Elata SDK

A cross-platform Hardware Abstraction Layer (HAL) for EEG devices with real-time signal processing and analysis models.

## Features

- **Cross-platform**: Browser (WASM), iOS (Swift), Android (Kotlin), Desktop (Rust)
- **Device abstraction**: Unified interface for multiple EEG devices
- **Signal processing**: FFT, band power analysis, filtering
- **Analysis models**: Alpha bump detection, calmness scoring
- **Real-time streaming**: BLE support for EEG headband devices

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                            Elata SDK                            │
├─────────────────────────────────────────────────────────────────┤
│  Platform Bindings                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  WASM    │  │  Swift   │  │  Kotlin  │  │  Rust    │        │
│  │ (Browser)│  │  (iOS)   │  │(Android) │  │(Desktop) │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       └─────────────┴─────────────┴─────────────┘              │
│                           │                                     │
│  FFI Layer (eeg-ffi)      │                                     │
│  ┌────────────────────────┴────────────────────────┐           │
│  │            UniFFI Bindings                       │           │
│  └──────────────────────┬──────────────────────────┘           │
│                         │                                       │
│  Models Layer (eeg-models)                                      │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ Alpha Bump      │  │ Calmness        │                      │
│  │ Detector        │  │ Model           │                      │
│  └────────┬────────┘  └────────┬────────┘                      │
│           └────────┬───────────┘                               │
│                    ▼                                            │
│  Signal Processing (eeg-signal)                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ FFT │ Band Power │ Filtering │ Windowing            │       │
│  └─────────────────────────────────────────────────────┘       │
│                    ▲                                            │
│  HAL Layer (eeg-hal)                                            │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              EegDevice Trait                         │       │
│  │   connect() │ start_stream() │ read_samples()       │       │
│  └─────────────────────────────────────────────────────┘       │
│           ▲                    ▲                                │
│  ┌────────┴────────┐  ┌───────┴────────┐                       │
│  │ Synthetic       │  │ Headband       │                       │
│  │ Device          │  │ (Web BLE)      │                       │
│  └─────────────────┘  └────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

## Crates

| Crate | Description |
|-------|-------------|
| `eeg-hal` | Core HAL traits: `EegDevice`, `SampleBuffer`, `ChannelConfig` |
| `eeg-hal-synthetic` | Synthetic EEG device for testing (configurable profiles) |
| `eeg-signal` | Signal processing: FFT, band power, filtering |
| `eeg-models` | Analysis models: Alpha Bump Detector, Calmness Model |
| `eeg-ffi` | FFI bindings for iOS/Android via UniFFI |
| `eeg-wasm` | WebAssembly bindings for browser |
| `bridge-proto` | BLE packet format and protocol definitions |
| `synthetic-ble-bridge` | Windows BLE peripheral bridge |

## Design Docs

- `docs/architecture-rppg.md` - Hybrid rPPG + ocular proxy architecture.
- `docs/implementation-plan-rppg.md` - rPPG implementation plan.
- `docs/architecture-sentiment.md` - Facial sentiment architecture.
- `docs/implementation-plan-sentiment.md` - Sentiment implementation plan.
- `docs/releasing.md` - npm release flow, tagging strategy, and bad-release recovery.

## Community

- `CONTRIBUTING.md` - How to propose changes, run checks, and submit PRs.
- `CODE_OF_CONDUCT.md` - Collaboration standards and enforcement.
- `SECURITY.md` - How to report vulnerabilities privately.

## Packages

- `packages/eeg-web` - Web wrapper around the WASM bindings (TS init + re-exports).
- `packages/eeg-web-ble` - Web Bluetooth transport for EEG headband devices (Muse-compatible) emitting normalized headband frames.
- `packages/rppg-web` - TS wrapper for the rPPG pipeline (processor + backend adapter).

## Local Development (Web Wrapper)

The SDK provides a single convenient command to build the EEG WASM, generate the
JS bindings, build the `packages/eeg-web` wrapper, and install it into a local
app. Use `run.sh sync-to` — it does everything for you.

Examples:

```bash
# build release artifacts and install into a local app (no save)
./run.sh sync-to ../my-app

# same, but persist the dependency in the app's package.json
SAVE=1 ./run.sh sync-to ../my-app

# build debug profile instead of release
./run.sh sync-to ../my-app debug
```

Notes:
- `sync-to` runs the wasm build + wasm-bindgen + `npm run sync-wasm` for
  `packages/eeg-web`, then installs that package into the target app.
- The command will error if the target app directory doesn't exist.
- `scripts/dev-link.sh` remains as a thin backward-compatible wrapper that
  delegates to `run.sh sync-to`.


## Quick Start

### Rust

```rust
use eeg_hal::{EegDevice, SampleBuffer};
use eeg_hal_synthetic::{SyntheticDevice, SignalProfile};
use eeg_models::{AlphaBumpDetector, CalmnessModel, Model};

// Create and configure device
let mut device = SyntheticDevice::new();
device.set_profile(SignalProfile::Relaxed);
device.connect()?;
device.start_stream()?;

// Create analysis models
let mut alpha_detector = AlphaBumpDetector::new(256);
let mut calmness = CalmnessModel::new(256);

// Read and analyze data
let mut buffer = SampleBuffer::new(256, 4);
device.read_samples(&mut buffer)?;

if let Some(output) = alpha_detector.process(&buffer) {
    println!("Alpha state: {:?}", output.state);
}
if let Some(output) = calmness.process(&buffer) {
    println!("Calmness: {:.0}%", output.smoothed_score * 100.0);
}
```

### Swift (iOS)

```swift
let processor = SignalProcessor(sampleRate: 256)
let powers = try processor.computeBandPowers(data: eegData)
print("Alpha: \(powers.alpha)")

let detector = AlphaBumpDetector(sampleRate: 256, channelCount: 4)
if let result = try detector.process(interleavedData: data) {
    print("State: \(result.state)")
}
```

### Kotlin (Android)

```kotlin
import uniffi.eeg_ffi.*

val processor = SignalProcessor(256u)
val powers = processor.computeBandPowers(eegData)
println("Alpha: ${powers.alpha}")

val detector = AlphaBumpDetector(256u, 4u)
detector.process(interleavedData)?.let { result ->
    println("State: ${result.state}")
}
```

### JavaScript (Browser)

```javascript
import init, { band_powers } from './pkg/eeg_wasm.js';

await init();
const powers = band_powers(eegData, 256);
console.log(`Alpha: ${powers.alpha}`);
```

## Platform Builds

### Browser (WASM)

```powershell
# Build WASM
cargo build --package eeg-wasm --target wasm32-unknown-unknown --release

# Generate JS bindings (PowerShell line continuation)
wasm-bindgen target/wasm32-unknown-unknown/release/eeg_wasm.wasm `
  --out-dir eeg-demo/pkg --target web

# Serve demo
npx http-server eeg-demo -p 8080
```

To use the Synthetic BLE bridge option in the web demo, run the bridge in Muse-compatible BLE mode:

```bash
cargo run -p synthetic-ble-bridge -- --ble
```

Note: This requires a Bluetooth LE adapter that supports the Peripheral (GATT server) role; many built-in Bluetooth radios on desktops/laptops do not.

See [eeg-demo/](eeg-demo/) for a complete browser demo with Muse BLE support.

### iOS

```bash
# Install targets (on macOS)
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# Build XCFramework
./scripts/build-ios.sh
```

See [ios-demo/](ios-demo/) for Swift Package and demo app.

### Android

```bash
# Install targets
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android

# Build native libraries
export ANDROID_NDK_HOME=/path/to/ndk
./scripts/build-android.sh
```

See [android-demo/](android-demo/) for Gradle project and demo app.

## Models

### Alpha Bump Detector

Detects transitions between high and low alpha states:

- **High alpha**: Relaxed, eyes closed
- **Low alpha**: Alert, eyes open
- **Transitioning**: State change in progress

```rust
let mut detector = AlphaBumpDetector::new(256);
detector.set_threshold(1.5);  // Sensitivity

if let Some(output) = detector.process(&buffer) {
    match output.state {
        AlphaState::High => println!("Relaxed"),
        AlphaState::Low => println!("Alert"),
        AlphaState::Transitioning => println!("Changing..."),
        AlphaState::Unknown => println!("Calibrating..."),
    }
}
```

### Calmness Model

Computes a continuous calmness score (0-100%) based on alpha/beta ratio:

```rust
let mut model = CalmnessModel::new(256);
model.set_smoothing(0.2);  // EMA smoothing factor

if let Some(output) = model.process(&buffer) {
    println!("Calmness: {:.0}%", output.smoothed_score * 100.0);
    println!("Alpha/Beta: {:.2}", output.alpha_beta_ratio);
}
```

## Signal Processing

```rust
use eeg_signal::{band_powers, fft, power_spectrum};

// Compute all band powers
let powers = band_powers(channel_data, 256.0);
println!("Delta: {}", powers.delta);  // 0.5-4 Hz
println!("Theta: {}", powers.theta);  // 4-8 Hz
println!("Alpha: {}", powers.alpha);  // 8-12 Hz
println!("Beta: {}", powers.beta);    // 12-30 Hz
println!("Gamma: {}", powers.gamma);  // 30-100 Hz

// Get relative powers (sum to 1.0)
let relative = powers.relative();
```

## Running Examples

```bash
# HAL demo with synthetic device
cargo run --example hal_demo

# BLE bridge with model analysis (Windows)
cargo run -p synthetic-ble-bridge -- --models --profile relaxed

# Run tests
cargo test --lib
```

## Project Structure

```
eeg-sdk/
├── crates/
│   ├── eeg-hal/              # Core HAL traits
│   ├── eeg-hal-synthetic/    # Synthetic device
│   ├── eeg-signal/           # Signal processing
│   ├── eeg-models/           # Analysis models
│   ├── eeg-ffi/              # iOS/Android bindings (UniFFI)
│   ├── eeg-wasm/             # Browser bindings (WASM)
│   ├── bridge-proto/         # BLE protocol
│   └── synthetic-ble-bridge/ # Windows BLE bridge
├── ios-demo/                 # iOS Swift demo
├── android-demo/             # Android Kotlin demo
├── eeg-demo/                 # Browser EEG demo (canonical)
├── examples/                 # Rust examples
└── scripts/                  # Build scripts
```

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Browser | ✅ Ready | WASM + Web Bluetooth |
| iOS | ✅ Ready | Swift via UniFFI |
| Android | ✅ Ready | Kotlin via UniFFI |
| Windows | ✅ Ready | Native Rust + BLE bridge |
| macOS | ✅ Ready | Native Rust |
| Linux | ✅ Ready | Native Rust |

## Device Support

| Device | Status | Notes |
|--------|--------|-------|
| Synthetic | ✅ Implemented | Configurable signal profiles |
| EEG headband | ✅ Browser | Web Bluetooth in eeg-demo |

## License

MIT
