#!/bin/bash
#
# Build script for iOS XCFramework
# Requires: Xcode, Rust, and iOS targets installed
#
# Install iOS targets:
#   rustup target add aarch64-apple-ios
#   rustup target add aarch64-apple-ios-sim
#   rustup target add x86_64-apple-ios (optional, for Intel Macs)
#

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FFI_CRATE="$PROJECT_ROOT/crates/eeg-ffi"
OUTPUT_DIR="$PROJECT_ROOT/ios-demo"
FRAMEWORK_NAME="EegSdkFFI"

echo "=== Building EEG SDK for iOS ==="
echo "Project root: $PROJECT_ROOT"

# Create output directories
mkdir -p "$OUTPUT_DIR/$FRAMEWORK_NAME.xcframework"
mkdir -p "$OUTPUT_DIR/EegSdkSwift/Sources"

# Build for iOS device (arm64)
echo ""
echo "=== Building for iOS Device (aarch64-apple-ios) ==="
cargo build --package eeg-ffi --release --target aarch64-apple-ios

# Build for iOS Simulator (arm64 - Apple Silicon)
echo ""
echo "=== Building for iOS Simulator (aarch64-apple-ios-sim) ==="
cargo build --package eeg-ffi --release --target aarch64-apple-ios-sim

# Optionally build for iOS Simulator (x86_64 - Intel Macs)
if rustup target list --installed | grep -q "x86_64-apple-ios"; then
    echo ""
    echo "=== Building for iOS Simulator (x86_64-apple-ios) ==="
    cargo build --package eeg-ffi --release --target x86_64-apple-ios
    HAS_X86_64=true
else
    HAS_X86_64=false
fi

# Generate Swift bindings
echo ""
echo "=== Generating Swift Bindings ==="
cargo run --package eeg-ffi --features cli --bin uniffi-bindgen -- \
    generate --library "$PROJECT_ROOT/target/aarch64-apple-ios/release/libeeg_ffi.a" \
    --language swift \
    --out-dir "$OUTPUT_DIR/EegSdkSwift/Sources"

# Move header and modulemap to a headers directory
HEADERS_DIR="$OUTPUT_DIR/Headers"
mkdir -p "$HEADERS_DIR"
mv "$OUTPUT_DIR/EegSdkSwift/Sources/eeg_ffiFFI.h" "$HEADERS_DIR/"
mv "$OUTPUT_DIR/EegSdkSwift/Sources/eeg_ffiFFI.modulemap" "$HEADERS_DIR/module.modulemap"

# Create a fat library for simulator if we have both arm64 and x86_64
if [ "$HAS_X86_64" = true ]; then
    echo ""
    echo "=== Creating Universal Simulator Library ==="
    mkdir -p "$PROJECT_ROOT/target/universal-ios-sim/release"
    lipo -create \
        "$PROJECT_ROOT/target/aarch64-apple-ios-sim/release/libeeg_ffi.a" \
        "$PROJECT_ROOT/target/x86_64-apple-ios/release/libeeg_ffi.a" \
        -output "$PROJECT_ROOT/target/universal-ios-sim/release/libeeg_ffi.a"
    SIM_LIB="$PROJECT_ROOT/target/universal-ios-sim/release/libeeg_ffi.a"
else
    SIM_LIB="$PROJECT_ROOT/target/aarch64-apple-ios-sim/release/libeeg_ffi.a"
fi

# Create XCFramework
echo ""
echo "=== Creating XCFramework ==="
rm -rf "$OUTPUT_DIR/$FRAMEWORK_NAME.xcframework"

xcodebuild -create-xcframework \
    -library "$PROJECT_ROOT/target/aarch64-apple-ios/release/libeeg_ffi.a" \
    -headers "$HEADERS_DIR" \
    -library "$SIM_LIB" \
    -headers "$HEADERS_DIR" \
    -output "$OUTPUT_DIR/$FRAMEWORK_NAME.xcframework"

echo ""
echo "=== Build Complete ==="
echo "XCFramework: $OUTPUT_DIR/$FRAMEWORK_NAME.xcframework"
echo "Swift sources: $OUTPUT_DIR/EegSdkSwift/Sources/eeg_ffi.swift"
echo ""
echo "To use in your iOS project:"
echo "1. Add $FRAMEWORK_NAME.xcframework to your project"
echo "2. Add eeg_ffi.swift to your project"
echo "3. Import and use the SDK:"
echo ""
echo "   import Foundation"
echo ""
echo "   // Signal processing"
echo "   let processor = SignalProcessor(sampleRate: 256)"
echo "   let powers = try processor.computeBandPowers(data: eegData)"
echo "   print(\"Alpha power: \\(powers.alpha)\")"
echo ""
echo "   // Alpha bump detection"
echo "   let detector = AlphaBumpDetector(sampleRate: 256, channelCount: 4)"
echo "   if let result = try detector.process(interleavedData: eegData) {"
echo "       print(\"Alpha state: \\(result.state)\")"
echo "   }"
echo ""
