#!/bin/bash
#
# Build script for Android native libraries
# Requires: Android NDK, Rust, and Android targets installed
#
# Install Android targets:
#   rustup target add aarch64-linux-android
#   rustup target add armv7-linux-androideabi
#   rustup target add x86_64-linux-android
#   rustup target add i686-linux-android
#
# Set ANDROID_NDK_HOME environment variable to your NDK path
#

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FFI_CRATE="$PROJECT_ROOT/crates/eeg-ffi"
OUTPUT_DIR="$PROJECT_ROOT/android-demo"

# Check for NDK
if [ -z "$ANDROID_NDK_HOME" ]; then
    echo "Error: ANDROID_NDK_HOME environment variable not set"
    echo "Please set it to your Android NDK installation path"
    exit 1
fi

echo "=== Building EEG SDK for Android ==="
echo "Project root: $PROJECT_ROOT"
echo "NDK path: $ANDROID_NDK_HOME"

# Determine NDK toolchain paths
HOST_TAG=""
case "$(uname -s)" in
    Linux*)  HOST_TAG="linux-x86_64";;
    Darwin*) HOST_TAG="darwin-x86_64";;
    MINGW*|MSYS*|CYGWIN*) HOST_TAG="windows-x86_64";;
esac

TOOLCHAIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG"

if [ ! -d "$TOOLCHAIN" ]; then
    echo "Error: Could not find NDK toolchain at $TOOLCHAIN"
    exit 1
fi

# Set up cargo config for Android cross-compilation
mkdir -p "$PROJECT_ROOT/.cargo"
cat > "$PROJECT_ROOT/.cargo/config.toml" << EOF
[target.aarch64-linux-android]
ar = "$TOOLCHAIN/bin/llvm-ar"
linker = "$TOOLCHAIN/bin/aarch64-linux-android21-clang"

[target.armv7-linux-androideabi]
ar = "$TOOLCHAIN/bin/llvm-ar"
linker = "$TOOLCHAIN/bin/armv7a-linux-androideabi21-clang"

[target.x86_64-linux-android]
ar = "$TOOLCHAIN/bin/llvm-ar"
linker = "$TOOLCHAIN/bin/x86_64-linux-android21-clang"

[target.i686-linux-android]
ar = "$TOOLCHAIN/bin/llvm-ar"
linker = "$TOOLCHAIN/bin/i686-linux-android21-clang"
EOF

# Build for each Android architecture
TARGETS=(
    "aarch64-linux-android:arm64-v8a"
    "armv7-linux-androideabi:armeabi-v7a"
    "x86_64-linux-android:x86_64"
    "i686-linux-android:x86"
)

for TARGET_PAIR in "${TARGETS[@]}"; do
    RUST_TARGET="${TARGET_PAIR%%:*}"
    ANDROID_ABI="${TARGET_PAIR##*:}"

    echo ""
    echo "=== Building for $ANDROID_ABI ($RUST_TARGET) ==="

    # Check if target is installed
    if ! rustup target list --installed | grep -q "$RUST_TARGET"; then
        echo "Warning: Target $RUST_TARGET not installed, skipping..."
        echo "Install with: rustup target add $RUST_TARGET"
        continue
    fi

    cargo build --package eeg-ffi --release --target "$RUST_TARGET"

    # Copy library to jniLibs folder
    JNI_DIR="$OUTPUT_DIR/eeg-sdk/src/main/jniLibs/$ANDROID_ABI"
    mkdir -p "$JNI_DIR"
    cp "$PROJECT_ROOT/target/$RUST_TARGET/release/libeeg_ffi.so" "$JNI_DIR/"

    echo "Built: $JNI_DIR/libeeg_ffi.so"
done

# Generate Kotlin bindings (if not already done)
echo ""
echo "=== Generating Kotlin Bindings ==="
KOTLIN_DIR="$OUTPUT_DIR/eeg-sdk/src/main/kotlin"
mkdir -p "$KOTLIN_DIR"

# Use one of the built libraries to generate bindings
if [ -f "$PROJECT_ROOT/target/aarch64-linux-android/release/libeeg_ffi.so" ]; then
    cargo run --package eeg-ffi --features cli --bin uniffi-bindgen -- \
        generate --library "$PROJECT_ROOT/target/aarch64-linux-android/release/libeeg_ffi.so" \
        --language kotlin \
        --out-dir "$KOTLIN_DIR"
else
    echo "Warning: No Android library found for binding generation"
    echo "Using debug build for bindings..."
    cargo build --package eeg-ffi
    cargo run --package eeg-ffi --features cli --bin uniffi-bindgen -- \
        generate --library "$PROJECT_ROOT/target/debug/libeeg_ffi.so" \
        --language kotlin \
        --out-dir "$KOTLIN_DIR"
fi

echo ""
echo "=== Build Complete ==="
echo ""
echo "Output directory: $OUTPUT_DIR/eeg-sdk"
echo ""
echo "JNI libraries:"
for TARGET_PAIR in "${TARGETS[@]}"; do
    ANDROID_ABI="${TARGET_PAIR##*:}"
    JNI_LIB="$OUTPUT_DIR/eeg-sdk/src/main/jniLibs/$ANDROID_ABI/libeeg_ffi.so"
    if [ -f "$JNI_LIB" ]; then
        SIZE=$(du -h "$JNI_LIB" | cut -f1)
        echo "  - $ANDROID_ABI: $SIZE"
    fi
done
echo ""
echo "Kotlin sources: $KOTLIN_DIR/uniffi/eeg_ffi/eeg_ffi.kt"
echo ""
echo "To use in your Android project:"
echo "1. Copy the eeg-sdk module to your project"
echo "2. Add it as a dependency in your app's build.gradle:"
echo "   implementation project(':eeg-sdk')"
echo ""
