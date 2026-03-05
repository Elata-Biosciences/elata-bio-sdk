# Consumer ProGuard rules for EEG SDK

# Keep JNA classes (required by UniFFI)
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }

# Keep all UniFFI generated classes
-keep class uniffi.eeg_ffi.** { *; }
-keepclassmembers class uniffi.eeg_ffi.** { *; }
