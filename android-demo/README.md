# Elata SDK for Android

Kotlin bindings for the Elata SDK, providing signal processing and analysis models for Android applications.

## Prerequisites

- Android Studio Arctic Fox or newer
- Android NDK (for building native libraries)
- Rust toolchain with Android targets:
  ```bash
  rustup target add aarch64-linux-android
  rustup target add armv7-linux-androideabi
  rustup target add x86_64-linux-android
  rustup target add i686-linux-android
  ```

## Building Native Libraries

Set the Android NDK path and run the build script:

```bash
export ANDROID_NDK_HOME=/path/to/android-ndk
chmod +x scripts/build-android.sh
./scripts/build-android.sh
```

This will:
1. Cross-compile the Rust FFI library for all Android ABIs
2. Generate Kotlin bindings
3. Place native libraries in `eeg-sdk/src/main/jniLibs/`

## Project Structure

```
android-demo/
├── app/                    # Demo application
│   └── src/main/kotlin/    # Demo app source
├── eeg-sdk/                # SDK library module
│   └── src/main/
│       ├── kotlin/         # Kotlin bindings
│       └── jniLibs/        # Native .so libraries
├── build.gradle.kts        # Root build file
└── settings.gradle.kts     # Project settings
```

## Integration

### Option 1: Include as Module

1. Copy the `eeg-sdk` folder to your project
2. Add to `settings.gradle.kts`:
   ```kotlin
   include(":eeg-sdk")
   ```
3. Add dependency in your app's `build.gradle.kts`:
   ```kotlin
   implementation(project(":eeg-sdk"))
   ```

### Option 2: AAR Library (coming soon)

Build as AAR and publish to local Maven or Maven Central.

## Usage

### Signal Processing

```kotlin
import uniffi.eeg_ffi.*

// Create a signal processor (256 Hz sample rate)
val processor = SignalProcessor(256u)

// Compute band powers from EEG data
val eegData: List<Float> = listOf(/* your samples */)
try {
    val powers = processor.computeBandPowers(eegData)
    println("Alpha: ${powers.alpha}")
    println("Beta: ${powers.beta}")
    println("Theta: ${powers.theta}")
    println("Delta: ${powers.delta}")
    println("Gamma: ${powers.gamma}")
} catch (e: EegException) {
    println("Error: $e")
}

// Get individual band powers
val alpha = processor.alphaPower(eegData)
val beta = processor.betaPower(eegData)

// Custom frequency band
val customPower = processor.customBandPower(eegData, 12.0f, 15.0f)

// Power spectrum
val spectrum = processor.powerSpectrum(eegData)
val frequencies = processor.fftFrequencies(eegData.size.toUInt())
```

### Alpha Bump Detection

Detects transitions between high and low alpha states:

```kotlin
// Create detector (256 Hz, 4 channels)
val detector = AlphaBumpDetector(256u, 4u)

// Configure detection parameters (optional)
detector.setThreshold(1.5f)
detector.setBaselineSmoothing(0.1f)

// Process interleaved multi-channel data
// Data format: [ch0_s0, ch1_s0, ch2_s0, ch3_s0, ch0_s1, ch1_s1, ...]
val interleavedData: List<Float> = listOf(/* your samples */)

try {
    detector.process(interleavedData)?.let { result ->
        when (result.state) {
            AlphaState.HIGH -> println("Alpha state: HIGH (relaxed)")
            AlphaState.LOW -> println("Alpha state: LOW (alert)")
            AlphaState.TRANSITIONING -> println("Alpha state: TRANSITIONING")
            AlphaState.UNKNOWN -> println("Alpha state: UNKNOWN (calibrating)")
        }

        println("Alpha power: ${result.alphaPower}")
        println("Baseline: ${result.baseline}")
        println("State changed: ${result.stateChanged}")
    }
} catch (e: EegException) {
    println("Error: $e")
}

// Reset detector state
detector.reset()
```

### Calmness Model

Computes a continuous calmness score (0-100%):

```kotlin
// Create model (256 Hz, 4 channels)
val model = CalmnessModel(256u, 4u)

// Configure smoothing (optional)
model.setSmoothing(0.2f)

// Process data
try {
    model.process(interleavedData)?.let { result ->
        println("Calmness score: ${result.score * 100}%")
        println("Smoothed score: ${result.smoothedScore * 100}%")
        println("Alpha/Beta ratio: ${result.alphaBetaRatio}")
        println("Alpha power: ${result.alphaPower}")
        println("Beta power: ${result.betaPower}")
        println("Theta power: ${result.thetaPower}")
    }
} catch (e: EegException) {
    println("Error: $e")
}

// Reset model state
model.reset()
```

### EEG Band Definitions

```kotlin
val bands = EegBands()

val alpha = bands.getAlpha()  // BandRange(low=8.0, high=12.0)
val beta = bands.getBeta()    // BandRange(low=12.0, high=30.0)
val theta = bands.getTheta()  // BandRange(low=4.0, high=8.0)
val delta = bands.getDelta()  // BandRange(low=0.5, high=4.0)
val gamma = bands.getGamma()  // BandRange(low=30.0, high=100.0)
```

### SDK Version

```kotlin
val version = getVersion()
println("Elata SDK version: $version")
```

## Demo App

The `app` module contains a demo Compose application showing:
- Real-time band power visualization
- Alpha state detection display
- Calmness score meter

To run:
1. Build native libraries (`./scripts/build-android.sh`)
2. Open `android-demo` in Android Studio
3. Run on device or emulator

## Error Handling

The SDK throws `EegException` for invalid operations:

```kotlin
try {
    val result = processor.computeBandPowers(emptyList())
} catch (e: EegException.InvalidData) {
    println("Invalid or empty data provided")
} catch (e: EegException.ProcessingException) {
    println("Error during signal processing")
} catch (e: EegException.NotEnoughSamples) {
    println("Need more samples for processing")
}
```

## Resource Management

SDK objects implement `AutoCloseable`. Use `use {}` or manually call `close()`:

```kotlin
// Using Kotlin's use extension
SignalProcessor(256u).use { processor ->
    val powers = processor.computeBandPowers(data)
    // ...
}

// Or manual management
val processor = SignalProcessor(256u)
try {
    val powers = processor.computeBandPowers(data)
} finally {
    processor.close()
}
```

## Supported ABIs

- `arm64-v8a` (64-bit ARM, most modern devices)
- `armeabi-v7a` (32-bit ARM, older devices)
- `x86_64` (64-bit x86, emulators)
- `x86` (32-bit x86, older emulators)

## ProGuard

The SDK includes consumer ProGuard rules. No additional configuration needed if using ProGuard/R8.

## Thread Safety

All SDK objects are thread-safe and can be used from any thread. The underlying Rust code uses `Mutex` for synchronization.
