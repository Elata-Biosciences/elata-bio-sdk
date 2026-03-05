//! Muse EEG Headband BLE Protocol
//!
//! This crate provides constants and utilities for the Muse BLE protocol,
//! enabling both real Muse device communication and synthetic emulation.

pub mod athena;
pub mod classic;
pub mod utils;

/// Muse device variant
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MuseVariant {
    Classic,
    Athena,
}

/// Muse BLE service UUID
pub const SERVICE_UUID: &str = "0000fe8d-0000-1000-8000-00805f9b34fb";
pub const SERVICE_UUID_U128: u128 = 0x0000fe8d_0000_1000_8000_00805f9b34fb;

/// Muse characteristic UUIDs
pub mod characteristic {
    /// Command characteristic - for sending control commands
    pub const COMMAND: &str = "273e0001-4c4d-454d-96be-f03bac821358";
    pub const COMMAND_U128: u128 = 0x273e0001_4c4d_454d_96be_f03bac821358;

    /// EEG channel TP9 (left ear)
    pub const TP9: &str = "273e0003-4c4d-454d-96be-f03bac821358";
    pub const TP9_U128: u128 = 0x273e0003_4c4d_454d_96be_f03bac821358;

    /// EEG channel AF7 (left forehead)
    pub const AF7: &str = "273e0004-4c4d-454d-96be-f03bac821358";
    pub const AF7_U128: u128 = 0x273e0004_4c4d_454d_96be_f03bac821358;

    /// EEG channel AF8 (right forehead)
    pub const AF8: &str = "273e0005-4c4d-454d-96be-f03bac821358";
    pub const AF8_U128: u128 = 0x273e0005_4c4d_454d_96be_f03bac821358;

    /// EEG channel TP10 (right ear)
    pub const TP10: &str = "273e0006-4c4d-454d-96be-f03bac821358";
    pub const TP10_U128: u128 = 0x273e0006_4c4d_454d_96be_f03bac821358;

    /// Right auxiliary electrode
    pub const RIGHT_AUX: &str = "273e0007-4c4d-454d-96be-f03bac821358";
    pub const RIGHT_AUX_U128: u128 = 0x273e0007_4c4d_454d_96be_f03bac821358;

    /// Gyroscope data
    pub const GYRO: &str = "273e0009-4c4d-454d-96be-f03bac821358";
    pub const GYRO_U128: u128 = 0x273e0009_4c4d_454d_96be_f03bac821358;

    /// Accelerometer data
    pub const ACCEL: &str = "273e000a-4c4d-454d-96be-f03bac821358";
    pub const ACCEL_U128: u128 = 0x273e000a_4c4d_454d_96be_f03bac821358;

    /// Telemetry data (battery, etc.)
    pub const TELEMETRY: &str = "273e000b-4c4d-454d-96be-f03bac821358";
    pub const TELEMETRY_U128: u128 = 0x273e000b_4c4d_454d_96be_f03bac821358;

    /// PPG channel 1 (IR)
    pub const PPG1: &str = "273e000f-4c4d-454d-96be-f03bac821358";
    pub const PPG1_U128: u128 = 0x273e000f_4c4d_454d_96be_f03bac821358;

    /// PPG channel 2 (Near-IR)
    pub const PPG2: &str = "273e0010-4c4d-454d-96be-f03bac821358";
    pub const PPG2_U128: u128 = 0x273e0010_4c4d_454d_96be_f03bac821358;

    /// PPG channel 3 (Red)
    pub const PPG3: &str = "273e0011-4c4d-454d-96be-f03bac821358";
    pub const PPG3_U128: u128 = 0x273e0011_4c4d_454d_96be_f03bac821358;

    /// All EEG channel UUIDs in order
    pub const EEG_CHANNELS: [u128; 4] = [TP9_U128, AF7_U128, AF8_U128, TP10_U128];
    pub const EEG_CHANNEL_NAMES: [&str; 4] = ["TP9", "AF7", "AF8", "TP10"];

    /// All PPG channel UUIDs in order
    pub const PPG_CHANNELS: [u128; 3] = [PPG1_U128, PPG2_U128, PPG3_U128];
    pub const PPG_CHANNEL_NAMES: [&str; 3] = ["PPG1", "PPG2", "PPG3"];
}

/// Muse device specifications
pub mod spec {
    /// EEG sample rate in Hz
    pub const SAMPLE_RATE: u16 = 256;
    /// Number of EEG channels
    pub const CHANNEL_COUNT: usize = 4;
    /// Samples per EEG packet (20 bytes = 2 header + 18 data = 12 samples)
    pub const SAMPLES_PER_PACKET: usize = 12;
    /// EEG packet size in bytes
    pub const PACKET_SIZE: usize = 20;

    /// PPG sample rate in Hz (Muse S/Muse 2)
    pub const PPG_SAMPLE_RATE: u16 = 64;
    /// Number of PPG channels (IR, near-IR, red)
    pub const PPG_CHANNEL_COUNT: usize = 3;
    /// Samples per PPG packet (20 bytes = 2 header + 18 data = 6 samples of 24 bits each)
    pub const PPG_SAMPLES_PER_PACKET: usize = 6;
    /// PPG packet size in bytes
    pub const PPG_PACKET_SIZE: usize = 20;
}

/// Muse control commands
pub mod command {
    /// Set preset v1 (default EEG mode)
    pub const SET_PRESET: &str = "v1";
    /// Enable PPG/aux channels
    pub const ENABLE_AUX: &str = "p21";
    /// Start data streaming
    pub const START_STREAM: &str = "d";
    /// Stop data streaming
    pub const STOP_STREAM: &str = "h";
    /// Request device info
    pub const DEVICE_INFO: &str = "?";

    /// Encode a command for BLE transmission
    /// Format: [length byte] [command string] [newline]
    pub fn encode(cmd: &str) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(cmd.len() + 2);
        bytes.push((cmd.len() + 1) as u8); // Length includes newline
        bytes.extend_from_slice(cmd.as_bytes());
        bytes.push(0x0A); // Newline
        bytes
    }

    /// Parse a received command (strips length prefix and newline)
    pub fn decode(data: &[u8]) -> Option<&str> {
        if data.is_empty() {
            return None;
        }
        let len = data[0] as usize;
        if data.len() < len + 1 {
            return None;
        }
        // Skip length byte, take command bytes (exclude newline)
        let cmd_end = if data.len() > 1 && data[len] == 0x0A {
            len
        } else {
            len.min(data.len() - 1)
        };
        std::str::from_utf8(&data[1..cmd_end]).ok()
    }
}

/// Encode 12 EEG samples (in microvolts) into a 20-byte Muse packet
///
/// Packet format:
/// - Bytes 0-1: Packet header/sequence number
/// - Bytes 2-19: 12 samples packed as 12-bit values (18 bytes)
///
/// Each pair of 12-bit samples is packed into 3 bytes:
/// [b0][b1][b2] where sample1 = b0<<4 | b1>>4, sample2 = (b1&0x0F)<<8 | b2
pub fn encode_eeg_packet(sequence: u16, samples: &[f32]) -> [u8; 20] {
    let mut packet = [0u8; 20];

    // Header: 2-byte sequence number
    packet[0] = (sequence >> 8) as u8;
    packet[1] = (sequence & 0xFF) as u8;

    // Convert samples to 12-bit ADC values and pack
    // ADC is centered at 0x800 (2048), scale: 256.0 / 125.0 LSB per uV
    let mut byte_idx = 2;
    let total_samples = spec::SAMPLES_PER_PACKET;
    for i in (0..total_samples).step_by(2) {
        let s1 = samples.get(i).copied().unwrap_or(0.0);
        let s2 = samples.get(i + 1).copied().unwrap_or(0.0);

        // Convert from microvolts to 12-bit ADC value
        let v1 = uv_to_adc(s1);
        let v2 = uv_to_adc(s2);

        // Pack two 12-bit values into 3 bytes
        packet[byte_idx] = (v1 >> 4) as u8;
        packet[byte_idx + 1] = ((v1 & 0x0F) << 4 | (v2 >> 8)) as u8;
        packet[byte_idx + 2] = (v2 & 0xFF) as u8;

        byte_idx += 3;
    }

    packet
}

/// Decode a 20-byte Muse EEG packet into samples (in microvolts)
pub fn decode_eeg_packet(packet: &[u8]) -> (u16, Vec<f32>) {
    if packet.len() < 20 {
        return (0, Vec::new());
    }

    // Extract sequence number
    let sequence = ((packet[0] as u16) << 8) | (packet[1] as u16);

    let mut samples = Vec::with_capacity(12);

    // Decode packed 12-bit samples
    for i in (2..20).step_by(3) {
        if i + 2 >= packet.len() {
            break;
        }

        let b0 = packet[i] as u16;
        let b1 = packet[i + 1] as u16;
        let b2 = packet[i + 2] as u16;

        // First 12-bit value: b0[7:0] + b1[7:4]
        let v1_raw = (b0 << 4) | (b1 >> 4);
        // Second 12-bit value: b1[3:0] + b2[7:0]
        let v2_raw = ((b1 & 0x0F) << 8) | b2;

        samples.push(adc_to_uv(v1_raw));
        samples.push(adc_to_uv(v2_raw));
    }

    (sequence, samples)
}

/// Decoded PPG frame with 6 samples.
///
/// Each PPG characteristic (PPG1, PPG2, PPG3) represents a different LED:
/// - PPG1: IR (infrared)
/// - PPG2: Near-IR (near infrared)
/// - PPG3: Red
///
/// Each packet contains 6 consecutive 24-bit samples of that LED type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PpgFrame {
    pub sequence: u16,
    pub samples: [u32; 6],
}

/// Encode 6 24-bit PPG samples into a 20-byte Muse packet.
///
/// Packet format:
/// - Bytes 0-1: Packet header/sequence number (big-endian)
/// - Bytes 2-19: 6 samples as 24-bit big-endian values (18 bytes)
pub fn encode_ppg_packet(sequence: u16, samples: &[u32; 6]) -> [u8; 20] {
    let mut packet = [0u8; 20];
    packet[0] = (sequence >> 8) as u8;
    packet[1] = (sequence & 0xFF) as u8;

    for (i, &sample) in samples.iter().enumerate() {
        let sample = sample & 0x00FF_FFFF; // 24-bit clamp
        let idx = 2 + i * 3;
        packet[idx] = (sample >> 16) as u8;
        packet[idx + 1] = (sample >> 8) as u8;
        packet[idx + 2] = sample as u8;
    }

    packet
}

/// Decode a 20-byte Muse PPG packet into a PpgFrame.
///
/// Each packet contains 6 consecutive 24-bit samples (big-endian).
pub fn decode_ppg_packet(packet: &[u8]) -> Option<PpgFrame> {
    if packet.len() < 20 {
        return None;
    }

    let sequence = ((packet[0] as u16) << 8) | (packet[1] as u16);
    let data = &packet[2..20];

    let mut samples = [0u32; 6];
    for (i, sample) in samples.iter_mut().enumerate() {
        let idx = i * 3;
        if idx + 2 >= data.len() {
            return None;
        }
        *sample =
            ((data[idx] as u32) << 16) | ((data[idx + 1] as u32) << 8) | (data[idx + 2] as u32);
    }

    Some(PpgFrame { sequence, samples })
}

/// Convert microvolts to 12-bit ADC value
fn uv_to_adc(uv: f32) -> u16 {
    // ADC centered at 0x800, scale factor: 256.0 / 125.0 LSB per uV
    let adc = (uv * 256.0 / 125.0) + 2048.0;
    (adc.clamp(0.0, 4095.0) as u16) & 0x0FFF
}

/// Convert 12-bit ADC value to microvolts
fn adc_to_uv(adc: u16) -> f32 {
    // Reverse: (adc - 2048) * 125.0 / 256.0
    ((adc as i16 - 0x800) as f32) * 125.0 / 256.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adc_conversion_roundtrip() {
        let test_values = [0.0, 10.0, -10.0, 100.0, -100.0, 200.0, -200.0];
        for &uv in &test_values {
            let adc = uv_to_adc(uv);
            let back = adc_to_uv(adc);
            // Allow small error due to 12-bit quantization
            assert!((uv - back).abs() < 0.5, "uv={uv}, adc={adc}, back={back}");
        }
    }

    #[test]
    fn test_packet_roundtrip() {
        let samples: Vec<f32> = (0..12).map(|i| (i as f32 - 6.0) * 10.0).collect();
        let packet = encode_eeg_packet(42, &samples);
        let (seq, decoded) = decode_eeg_packet(&packet);

        assert_eq!(seq, 42);
        assert_eq!(decoded.len(), 12);

        for (i, (&orig, &dec)) in samples.iter().zip(decoded.iter()).enumerate() {
            assert!(
                (orig - dec).abs() < 0.5,
                "sample {i}: orig={orig}, decoded={dec}"
            );
        }
    }

    #[test]
    fn test_command_encode_decode() {
        let cmd = "d";
        let encoded = command::encode(cmd);
        assert_eq!(encoded, vec![2, b'd', 0x0A]);

        let decoded = command::decode(&encoded);
        assert_eq!(decoded, Some("d"));
    }

    #[test]
    fn test_command_decode_rejects_short_payload() {
        let data = vec![3, b'd', 0x0A];
        let decoded = command::decode(&data);
        assert_eq!(decoded, None);
    }

    #[test]
    fn test_decode_short_packet_returns_empty() {
        let (seq, samples) = decode_eeg_packet(&[0u8; 10]);
        assert_eq!(seq, 0);
        assert!(samples.is_empty());
    }

    #[test]
    fn test_packet_with_short_sample_input_zero_fills() {
        let samples = vec![50.0, -25.0];
        let packet = encode_eeg_packet(1, &samples);
        let (_seq, decoded) = decode_eeg_packet(&packet);

        assert_eq!(decoded.len(), 12);
        assert!((decoded[0] - 50.0).abs() < 0.5);
        assert!((decoded[1] + 25.0).abs() < 0.5);
        for value in decoded.iter().skip(2) {
            assert!(value.abs() < 0.5);
        }
    }

    #[test]
    fn test_packet_clamps_out_of_range_samples() {
        let samples = vec![1_000_000.0, -1_000_000.0].repeat(6);
        let packet = encode_eeg_packet(7, &samples);
        let (_seq, decoded) = decode_eeg_packet(&packet);

        let max_uv = ((0x0FFFu16 as i16 - 0x800) as f32) * 125.0 / 256.0;
        let min_uv = ((0u16 as i16 - 0x800) as f32) * 125.0 / 256.0;

        assert!((decoded[0] - max_uv).abs() < 0.5);
        assert!((decoded[1] - min_uv).abs() < 0.5);
    }

    #[test]
    fn test_ppg_packet_roundtrip() {
        // 6 samples of 24-bit values
        let samples = [0x000000, 0x000001, 0xABCDEF, 0xFFFFFF, 0x123456, 0x654321];
        let packet = encode_ppg_packet(9, &samples);
        let decoded = decode_ppg_packet(&packet).expect("ppg decode");

        assert_eq!(decoded.sequence, 9);
        assert_eq!(decoded.samples, samples);
    }
}
