# EEG SDK ProGuard Rules

# Keep JNA classes
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }

# Keep UniFFI generated code
-keep class uniffi.eeg_ffi.** { *; }
-keepclassmembers class uniffi.eeg_ffi.** { *; }

# Keep native method names
-keepclasseswithmembernames class * {
    native <methods>;
}
