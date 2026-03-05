use eeg_hal::{EegDevice, SampleBuffer};
use eeg_hal_synthetic::{NoiseLevel, SignalProfile, SyntheticDevice};
use eeg_models::{AlphaBumpDetector, CalmnessModel, Model};
use eeg_signal::band_powers;

fn build_device(profile: SignalProfile) -> SyntheticDevice {
    let mut device = SyntheticDevice::with_config(256, 4);
    device.set_profile(profile);
    device.set_noise_level(NoiseLevel::None);
    device.set_samples_per_read(32);
    device.connect().expect("connect");
    device.start_stream().expect("start stream");
    device
}

fn collect_samples(
    device: &mut SyntheticDevice,
    sample_rate: u16,
    channel_count: usize,
    target_samples: usize,
) -> SampleBuffer {
    let mut buffer = SampleBuffer::new(sample_rate, channel_count);
    while buffer.sample_count() < target_samples {
        device.read_samples(&mut buffer).expect("read samples");
    }
    buffer
}

#[test]
fn relaxed_profile_has_higher_alpha_and_calmness_than_alert() {
    let sample_rate = 256;
    let channel_count = 4;

    let mut relaxed_device = build_device(SignalProfile::Relaxed);
    let relaxed_buffer = collect_samples(
        &mut relaxed_device,
        sample_rate,
        channel_count,
        sample_rate as usize,
    );

    let relaxed_powers = band_powers(relaxed_buffer.channel_data(0), sample_rate as f32);
    assert!(relaxed_powers.alpha > relaxed_powers.beta);

    let mut relaxed_model = CalmnessModel::new(sample_rate);
    let relaxed_output = relaxed_model
        .process(&relaxed_buffer)
        .expect("relaxed output");

    let mut alert_device = build_device(SignalProfile::Alert);
    let alert_buffer = collect_samples(
        &mut alert_device,
        sample_rate,
        channel_count,
        sample_rate as usize,
    );
    let mut alert_model = CalmnessModel::new(sample_rate);
    let alert_output = alert_model.process(&alert_buffer).expect("alert output");

    assert!(relaxed_output.alpha_beta_ratio > alert_output.alpha_beta_ratio);
    assert!(relaxed_output.score > alert_output.score);
}

#[test]
fn alpha_bump_detector_produces_output_from_synthetic_stream() {
    let sample_rate = 256;
    let channel_count = 4;

    let mut device = build_device(SignalProfile::Relaxed);
    let buffer = collect_samples(
        &mut device,
        sample_rate,
        channel_count,
        (sample_rate as usize) * 2,
    );

    let mut detector = AlphaBumpDetector::new(sample_rate);
    let output = detector.process(&buffer).expect("alpha output");

    assert!(output.alpha_power > 0.0);
    assert!(output.baseline > 0.0);
}
