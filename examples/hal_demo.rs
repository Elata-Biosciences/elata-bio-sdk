//! End-to-end HAL demonstration
//!
//! This example shows the complete pipeline:
//! 1. Create a synthetic EEG device
//! 2. Connect and start streaming
//! 3. Process data through both models
//! 4. Display results
//!
//! Run with: cargo run --example hal_demo

use eeg_hal::{EegDevice, SampleBuffer};
use eeg_hal_synthetic::{NoiseLevel, SignalProfile, SyntheticDevice};
use eeg_models::{AlphaBumpDetector, CalmnessModel, Model, ModelOutput};

fn main() {
    println!("=== EEG HAL Demo ===\n");

    // Create and configure the synthetic device
    let mut device = SyntheticDevice::with_config(256, 4);
    device.set_profile(SignalProfile::Relaxed);
    device.set_noise_level(NoiseLevel::Low);
    device.set_samples_per_read(16);

    println!("Device: {}", device.info().name);
    println!("Sample Rate: {} Hz", device.info().sample_rate);
    println!("Channels: {}", device.info().channels.channel_count());
    println!();

    // Connect to device
    device.connect().expect("Failed to connect");
    device.start_stream().expect("Failed to start stream");
    println!("Connected and streaming...\n");

    // Create models
    let mut alpha_detector = AlphaBumpDetector::new(256);
    let mut calmness_model = CalmnessModel::new(256);

    // Buffer for analysis (1 second window)
    let mut buffer = SampleBuffer::new(256, 4);
    let analysis_window = 256;

    // Simulate different brain states
    let profiles = [
        (SignalProfile::Relaxed, "Relaxed (eyes closed)"),
        (SignalProfile::Alert, "Alert (focused)"),
        (SignalProfile::Meditative, "Meditative (deep relaxation)"),
        (SignalProfile::Drowsy, "Drowsy"),
    ];

    for (profile, description) in profiles {
        println!("--- {} ---", description);
        device.set_profile(profile);

        // Reset models and buffer for new profile
        alpha_detector.reset();
        calmness_model.reset();
        buffer.clear();

        // Collect ~2 seconds of data
        for _ in 0..32 {
            device
                .read_samples(&mut buffer)
                .expect("Failed to read samples");
            std::thread::sleep(std::time::Duration::from_millis(62));
        }

        // Keep only analysis window
        if buffer.sample_count() > analysis_window {
            buffer.retain_recent(analysis_window);
        }

        // Run models
        if let Some(alpha_output) = alpha_detector.process(&buffer) {
            println!("  Alpha: {}", alpha_output.description());
        }

        if let Some(calmness_output) = calmness_model.process(&buffer) {
            println!("  Calmness: {}", calmness_output.description());
        }

        println!();
    }

    // Cleanup
    device.stop_stream().expect("Failed to stop stream");
    device.disconnect().expect("Failed to disconnect");

    println!("Demo complete!");
}
