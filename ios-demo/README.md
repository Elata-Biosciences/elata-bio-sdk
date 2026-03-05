# Elata SDK for iOS

Swift bindings for the Elata SDK, providing signal processing, analysis models, and Muse BLE connectivity for iOS applications.

## Features

- **Signal Processing**: FFT, band power analysis, filtering via Rust SDK
- **Analysis Models**: Alpha bump detection, calmness scoring
- **Muse BLE Support**: Native CoreBluetooth connection to Muse S/Muse 2 headbands
- **SwiftUI Demo**: Complete demo app with real-time visualization

## Prerequisites

- macOS with Xcode 14+
- Rust toolchain with iOS targets:
  ```bash
  rustup target add aarch64-apple-ios
  rustup target add aarch64-apple-ios-sim
  # Optional for Intel Macs:
  rustup target add x86_64-apple-ios
  ```

## Building

From the project root, run the build script:

```bash
chmod +x scripts/build-ios.sh
./scripts/build-ios.sh
```

This will:
1. Compile the Rust FFI library for iOS device and simulator
2. Generate Swift bindings
3. Create an XCFramework at `ios-demo/EegSdkFFI.xcframework`

## Project Structure

```
ios-demo/
├── EegDemoApp/
│   ├── EegDemoApp.swift       # App entry point
│   ├── ContentView.swift      # Main UI with Muse support
│   ├── Info.plist             # Bluetooth permissions
│   └── Bluetooth/
│       ├── MuseBluetoothManager.swift  # CoreBluetooth manager
│       ├── MuseDataParser.swift        # EEG packet decoding
│       └── MuseConstants.swift         # BLE UUIDs and specs
├── EegSdkSwift/
│   ├── Package.swift          # Swift Package manifest
│   └── Sources/
│       └── eeg_ffi.swift      # Generated UniFFI bindings
└── README.md
```

## Integration

### Option 1: Swift Package (Recommended)

Add the `EegSdkSwift` package to your Xcode project:
1. File → Add Packages
2. Add local package from `ios-demo/EegSdkSwift`

### Option 2: Manual Integration

1. Drag `EegSdkFFI.xcframework` into your Xcode project
2. Add `EegSdkSwift/Sources/eeg_ffi.swift` to your target
3. Ensure the framework is embedded and signed

## Muse BLE Connection

The demo app includes native CoreBluetooth support for Muse S and Muse 2 headbands.

### Required Permissions

Add to your `Info.plist`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>App needs Bluetooth to connect to your Muse headband.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>App needs Bluetooth to connect to your Muse headband.</string>
<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-central</string>
</array>
```

### Using MuseBluetoothManager

```swift
import SwiftUI

struct MyView: View {
    @StateObject private var museManager = MuseBluetoothManager()

    var body: some View {
        VStack {
            Text("Status: \(museManager.connectionState.description)")

            Button("Scan") {
                museManager.startScanning()
            }

            Button("Start Stream") {
                museManager.startStreaming()
            }
        }
        .onAppear {
            // Set up data callback
            museManager.onEegData = { interleavedData in
                // Process EEG data
                // interleavedData format: [ch0_s0, ch1_s0, ch2_s0, ch3_s0, ch0_s1, ...]
                processData(interleavedData)
            }
        }
    }
}
```

### Connection States

```swift
enum MuseConnectionState {
    case disconnected
    case scanning
    case connecting
    case connected
    case streaming
    case error(String)
}
```

## Signal Processing

```swift
// Create a signal processor (256 Hz sample rate)
let processor = SignalProcessor(sampleRate: 256)

// Compute band powers from EEG data
let eegData: [Float] = [...] // Your EEG samples
do {
    let powers = try processor.computeBandPowers(data: eegData)
    print("Alpha: \(powers.alpha)")
    print("Beta: \(powers.beta)")
    print("Theta: \(powers.theta)")
    print("Delta: \(powers.delta)")
    print("Gamma: \(powers.gamma)")
} catch {
    print("Error: \(error)")
}

// Get individual band powers
let alpha = try processor.alphaPower(data: eegData)
let beta = try processor.betaPower(data: eegData)

// Custom frequency band
let customPower = try processor.customBandPower(
    data: eegData,
    lowFreq: 12.0,
    highFreq: 15.0
)

// Power spectrum
let spectrum = try processor.powerSpectrum(data: eegData)
let frequencies = processor.fftFrequencies(sampleCount: UInt32(eegData.count))
```

## Alpha Bump Detection

Detects transitions between high and low alpha states:

```swift
// Create detector (256 Hz, 4 channels)
let detector = AlphaBumpDetector(sampleRate: 256, channelCount: 4)

// Configure detection parameters (optional)
detector.setThreshold(multiplier: 1.5)
detector.setBaselineSmoothing(alpha: 0.1)

// Process interleaved multi-channel data
// Data format: [ch0_s0, ch1_s0, ch2_s0, ch3_s0, ch0_s1, ch1_s1, ...]
let interleavedData: [Float] = [...]

do {
    if let result = try detector.process(interleavedData: interleavedData) {
        switch result.state {
        case .high:
            print("Alpha state: HIGH (relaxed, eyes closed)")
        case .low:
            print("Alpha state: LOW (alert, eyes open)")
        case .transitioning:
            print("Alpha state: TRANSITIONING")
        case .unknown:
            print("Alpha state: UNKNOWN (calibrating)")
        }

        print("Alpha power: \(result.alphaPower)")
        print("Baseline: \(result.baseline)")
        print("State changed: \(result.stateChanged)")
    }
} catch {
    print("Error: \(error)")
}

// Reset detector state
detector.reset()
```

## Calmness Model

Computes a continuous calmness score (0-100%):

```swift
// Create model (256 Hz, 4 channels)
let model = CalmnessModel(sampleRate: 256, channelCount: 4)

// Configure smoothing (optional)
model.setSmoothing(alpha: 0.2)

// Process data
do {
    if let result = try model.process(interleavedData: interleavedData) {
        print("Calmness score: \(result.score * 100)%")
        print("Smoothed score: \(result.smoothedScore * 100)%")
        print("Alpha/Beta ratio: \(result.alphaBetaRatio)")
    }
} catch {
    print("Error: \(error)")
}

// Reset model state
model.reset()
```

## Demo App

The `EegDemoApp` folder contains a complete SwiftUI app demonstrating:
- Muse BLE connection (scan, connect, stream)
- Synthetic data simulation mode
- Real-time band power visualization
- Alpha state detection display
- Calmness score meter

To run the demo:
1. Build the SDK (`./scripts/build-ios.sh`)
2. Open the project in Xcode
3. Add `EegSdkFFI.xcframework` and `eeg_ffi.swift` to the target
4. Uncomment the SDK code in `ContentView.swift`
5. Run on a real device (BLE requires physical hardware)

## Error Handling

The SDK throws `EegError` for invalid operations:

```swift
do {
    let result = try processor.computeBandPowers(data: emptyArray)
} catch EegError.invalidData {
    print("Invalid or empty data provided")
} catch EegError.processingError {
    print("Error during signal processing")
} catch EegError.notEnoughSamples {
    print("Need more samples for processing")
}
```

## Thread Safety

- All SDK objects are thread-safe (Rust `Mutex` synchronization)
- `MuseBluetoothManager` publishes state changes on the main thread
- EEG data callbacks are dispatched on the main thread

## Memory Management

Swift's ARC handles memory management automatically. The FFI layer properly releases Rust resources when Swift objects are deallocated.
