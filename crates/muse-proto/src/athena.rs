//! Muse S Athena (multiplexed BLE) protocol helpers.
//!
//! This module follows the OpenMuse decoding model:
//! MESSAGE -> PACKET (14-byte header) -> SUBPACKETS (tag + 4-byte header + data)
//!
//! Notes:
//! - EEG is 14-bit packed values, LSB-first within each byte.
//! - Optics are 20-bit packed values, LSB-first within each byte.
//! - ACC/GYRO are int16 little-endian values.

use crate::utils::{extract_packed_le, pack_packed_le};

/// Athena characteristic UUIDs
pub mod characteristic {
    /// Command / control characteristic
    pub const COMMAND: &str = "273e0001-4c4d-454d-96be-f03bac821358";
    pub const COMMAND_U128: u128 = 0x273e0001_4c4d_454d_96be_f03bac821358;

    /// Athena EEG data characteristic
    pub const SENSOR_EEG: &str = "273e0013-4c4d-454d-96be-f03bac821358";
    pub const SENSOR_EEG_U128: u128 = 0x273e0013_4c4d_454d_96be_f03bac821358;

    /// Athena secondary data characteristic (IMU/optics/battery)
    pub const SENSOR_OTHER: &str = "273e0014-4c4d-454d-96be-f03bac821358";
    pub const SENSOR_OTHER_U128: u128 = 0x273e0014_4c4d_454d_96be_f03bac821358;

    /// Backwards-compatible alias used by earlier code
    pub const SENSOR_COMBINED: &str = SENSOR_EEG;
    pub const SENSOR_COMBINED_U128: u128 = SENSOR_EEG_U128;
}

/// Athena control commands
pub mod command {
    /// Version query (used by OpenMuse)
    pub const VERSION: &str = "v6";
    /// Status query
    pub const STATUS: &str = "s";
    /// Halt/stop streaming
    pub const HALT: &str = "h";
    /// Start streaming (must be sent twice)
    pub const START_STREAM: &str = "dc001";
    /// Low-latency mode
    pub const L1: &str = "L1";
}

/// Athena device specifications
pub mod spec {
    /// EEG sample rate in Hz
    pub const EEG_SAMPLE_RATE: u16 = 256;
    /// Number of EEG channels (EEG8)
    pub const EEG_CHANNEL_COUNT: usize = 8;
    /// Samples per EEG8 subpacket
    pub const EEG_SAMPLES_PER_CHANNEL: usize = 2;
    /// ACC/GYRO sample rate in Hz
    pub const ACCGYRO_SAMPLE_RATE: u16 = 52;
    /// Optics sample rate in Hz
    pub const OPTICS_SAMPLE_RATE: u16 = 64;
}

const PACKET_HEADER_SIZE: usize = 14;
const SUBPACKET_HEADER_SIZE: usize = 5;

const EEG_SCALE: f32 = 1450.0 / 16383.0;
const OPTICS_SCALE: f32 = 1.0 / 32768.0;
const ACC_SCALE: f32 = 0.0000610352;
const GYRO_SCALE: f32 = -0.0074768;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SensorType {
    Eeg,
    AccGyro,
    Optics,
    Battery,
    Unknown,
}

#[derive(Debug, Clone, Copy)]
struct SensorConfig {
    sensor_type: SensorType,
    n_channels: usize,
    n_samples: usize,
    data_len: usize,
}

fn sensor_config(tag: u8) -> SensorConfig {
    match tag {
        // EEG4 (4 channels x 4 samples = 28 bytes)
        0x11 => SensorConfig {
            sensor_type: SensorType::Eeg,
            n_channels: 4,
            n_samples: 4,
            data_len: 28,
        },
        // EEG8 (8 channels x 2 samples = 28 bytes)
        0x12 => SensorConfig {
            sensor_type: SensorType::Eeg,
            n_channels: 8,
            n_samples: 2,
            data_len: 28,
        },
        // Optics4 (4 channels x 3 samples = 30 bytes)
        0x34 => SensorConfig {
            sensor_type: SensorType::Optics,
            n_channels: 4,
            n_samples: 3,
            data_len: 30,
        },
        // Optics8 (8 channels x 2 samples = 40 bytes)
        0x35 => SensorConfig {
            sensor_type: SensorType::Optics,
            n_channels: 8,
            n_samples: 2,
            data_len: 40,
        },
        // Optics16 (16 channels x 1 sample = 40 bytes)
        0x36 => SensorConfig {
            sensor_type: SensorType::Optics,
            n_channels: 16,
            n_samples: 1,
            data_len: 40,
        },
        // Acc/Gyro (6 channels x 3 samples = 36 bytes)
        0x47 => SensorConfig {
            sensor_type: SensorType::AccGyro,
            n_channels: 6,
            n_samples: 3,
            data_len: 36,
        },
        // Battery (new firmware)
        0x88 => SensorConfig {
            sensor_type: SensorType::Battery,
            n_channels: 1,
            n_samples: 1,
            data_len: 188, // minimum observed; payload varies
        },
        // Battery (old firmware)
        0x98 => SensorConfig {
            sensor_type: SensorType::Battery,
            n_channels: 1,
            n_samples: 1,
            data_len: 20,
        },
        _ => SensorConfig {
            sensor_type: SensorType::Unknown,
            n_channels: 0,
            n_samples: 0,
            data_len: 0,
        },
    }
}

/// EEG frame decoded from Athena packets.
#[derive(Debug, Clone)]
pub struct EegFrame {
    pub pkt_index: u8,
    pub pkt_time_raw: u32,
    pub subpkt_index: Option<u8>,
    /// Channel-major data: channels[ch][sample_idx]
    pub channels: Vec<Vec<f32>>,
}

impl EegFrame {
    pub fn channel_count(&self) -> usize {
        self.channels.len()
    }

    pub fn samples_per_channel(&self) -> usize {
        self.channels.first().map(|c| c.len()).unwrap_or(0)
    }

    pub fn channel(&self, idx: usize) -> Option<&[f32]> {
        self.channels.get(idx).map(|v| v.as_slice())
    }
}

/// ACC/GYRO frame: 3 samples of 6 channels.
#[derive(Debug, Clone)]
pub struct AccGyroFrame {
    pub pkt_index: u8,
    pub pkt_time_raw: u32,
    pub subpkt_index: Option<u8>,
    pub samples: Vec<[f32; 6]>,
}

/// Optics frame (4/8/16 channels).
#[derive(Debug, Clone)]
pub struct OpticsFrame {
    pub pkt_index: u8,
    pub pkt_time_raw: u32,
    pub subpkt_index: Option<u8>,
    /// Channel-major data: channels[ch][sample_idx]
    pub channels: Vec<Vec<f32>>,
}

/// Battery sample (percentage).
#[derive(Debug, Clone)]
pub struct BatterySample {
    pub pkt_index: u8,
    pub pkt_time_raw: u32,
    pub percent: f32,
}

/// Decoded Athena packet variants.
#[derive(Debug, Clone)]
pub enum AthenaPacket {
    Eeg(EegFrame),
    AccGyro(AccGyroFrame),
    Optics(OpticsFrame),
    Battery(BatterySample),
    Unknown {
        tag: u8,
        pkt_index: u8,
        pkt_time_raw: u32,
    },
}

/// Decode a BLE notification payload into Athena packets.
pub fn decode_message(payload: &[u8]) -> Vec<AthenaPacket> {
    let mut out = Vec::new();
    let mut offset = 0;

    while offset < payload.len() {
        let pkt_len = payload[offset] as usize;
        if pkt_len == 0 {
            break;
        }
        if offset + pkt_len > payload.len() {
            break;
        }
        if pkt_len < PACKET_HEADER_SIZE {
            break;
        }

        let pkt = &payload[offset..offset + pkt_len];
        let pkt_index = pkt[1];
        let pkt_time_raw = u32::from_le_bytes([pkt[2], pkt[3], pkt[4], pkt[5]]);
        let pkt_id = pkt[9];

        let pkt_data = &pkt[PACKET_HEADER_SIZE..];
        let pkt_cfg = sensor_config(pkt_id);

        // First subpacket: raw data for pkt_id (no tag/header)
        let mut data_offset = 0;
        if pkt_cfg.data_len > 0 && pkt_data.len() >= pkt_cfg.data_len {
            let data = &pkt_data[..pkt_cfg.data_len];
            decode_subpacket(
                pkt_id,
                pkt_index,
                pkt_time_raw,
                None,
                data,
                &pkt_cfg,
                &mut out,
            );
            data_offset = pkt_cfg.data_len;
        }

        // Additional tagged subpackets
        while data_offset + SUBPACKET_HEADER_SIZE <= pkt_data.len() {
            let tag = pkt_data[data_offset];
            let subpkt_index = pkt_data[data_offset + 1];
            let cfg = sensor_config(tag);
            if matches!(cfg.sensor_type, SensorType::Unknown) {
                break;
            }
            let data_len = cfg.data_len;
            if data_len == 0 {
                break;
            }
            let full_len = SUBPACKET_HEADER_SIZE + data_len;
            if data_offset + full_len > pkt_data.len() {
                break;
            }
            let data_start = data_offset + SUBPACKET_HEADER_SIZE;
            let data = &pkt_data[data_start..data_start + data_len];
            decode_subpacket(
                tag,
                pkt_index,
                pkt_time_raw,
                Some(subpkt_index),
                data,
                &cfg,
                &mut out,
            );
            data_offset += full_len;
        }

        offset += pkt_len;
    }

    out
}

fn decode_subpacket(
    tag: u8,
    pkt_index: u8,
    pkt_time_raw: u32,
    subpkt_index: Option<u8>,
    data: &[u8],
    cfg: &SensorConfig,
    out: &mut Vec<AthenaPacket>,
) {
    match cfg.sensor_type {
        SensorType::Eeg => {
            if let Some(frame) = decode_eeg(tag, pkt_index, pkt_time_raw, subpkt_index, data, cfg) {
                out.push(AthenaPacket::Eeg(frame));
            }
        }
        SensorType::AccGyro => {
            if let Some(frame) = decode_accgyro(pkt_index, pkt_time_raw, subpkt_index, data) {
                out.push(AthenaPacket::AccGyro(frame));
            }
        }
        SensorType::Optics => {
            if let Some(frame) = decode_optics(pkt_index, pkt_time_raw, subpkt_index, data, cfg) {
                out.push(AthenaPacket::Optics(frame));
            }
        }
        SensorType::Battery => {
            if let Some(sample) = decode_battery(pkt_index, pkt_time_raw, data) {
                out.push(AthenaPacket::Battery(sample));
            }
        }
        SensorType::Unknown => {
            out.push(AthenaPacket::Unknown {
                tag,
                pkt_index,
                pkt_time_raw,
            });
        }
    }
}

fn decode_eeg(
    _tag: u8,
    pkt_index: u8,
    pkt_time_raw: u32,
    subpkt_index: Option<u8>,
    data: &[u8],
    cfg: &SensorConfig,
) -> Option<EegFrame> {
    if data.len() < cfg.data_len || cfg.n_channels == 0 || cfg.n_samples == 0 {
        return None;
    }

    let total_values = cfg.n_channels * cfg.n_samples;
    if total_values * 14 > data.len() * 8 {
        return None;
    }

    let mut values = Vec::with_capacity(total_values);
    for i in 0..total_values {
        let raw = extract_packed_le(data, i * 14, 14);
        values.push(raw as f32 * EEG_SCALE);
    }

    let mut channels = vec![Vec::with_capacity(cfg.n_samples); cfg.n_channels];
    for sample_idx in 0..cfg.n_samples {
        for ch in 0..cfg.n_channels {
            let idx = sample_idx * cfg.n_channels + ch;
            channels[ch].push(values[idx]);
        }
    }

    Some(EegFrame {
        pkt_index,
        pkt_time_raw,
        subpkt_index,
        channels,
    })
}

fn decode_accgyro(
    pkt_index: u8,
    pkt_time_raw: u32,
    subpkt_index: Option<u8>,
    data: &[u8],
) -> Option<AccGyroFrame> {
    if data.len() < 36 {
        return None;
    }

    let mut samples = Vec::with_capacity(3);
    for i in 0..3 {
        let base = i * 12;
        let mut vals = [0f32; 6];
        for ch in 0..6 {
            let idx = base + ch * 2;
            let raw = i16::from_le_bytes([data[idx], data[idx + 1]]) as f32;
            vals[ch] = if ch < 3 {
                raw * ACC_SCALE
            } else {
                raw * GYRO_SCALE
            };
        }
        samples.push(vals);
    }

    Some(AccGyroFrame {
        pkt_index,
        pkt_time_raw,
        subpkt_index,
        samples,
    })
}

fn decode_optics(
    pkt_index: u8,
    pkt_time_raw: u32,
    subpkt_index: Option<u8>,
    data: &[u8],
    cfg: &SensorConfig,
) -> Option<OpticsFrame> {
    if data.len() < cfg.data_len || cfg.n_channels == 0 || cfg.n_samples == 0 {
        return None;
    }

    let total_values = cfg.n_channels * cfg.n_samples;
    if total_values * 20 > data.len() * 8 {
        return None;
    }

    let mut values = Vec::with_capacity(total_values);
    for i in 0..total_values {
        let raw = extract_packed_le(data, i * 20, 20);
        values.push(raw as f32 * OPTICS_SCALE);
    }

    let mut channels = vec![Vec::with_capacity(cfg.n_samples); cfg.n_channels];
    for sample_idx in 0..cfg.n_samples {
        for ch in 0..cfg.n_channels {
            let idx = sample_idx * cfg.n_channels + ch;
            channels[ch].push(values[idx]);
        }
    }

    Some(OpticsFrame {
        pkt_index,
        pkt_time_raw,
        subpkt_index,
        channels,
    })
}

fn decode_battery(pkt_index: u8, pkt_time_raw: u32, data: &[u8]) -> Option<BatterySample> {
    if data.len() < 2 {
        return None;
    }
    let raw = u16::from_le_bytes([data[0], data[1]]) as f32;
    Some(BatterySample {
        pkt_index,
        pkt_time_raw,
        percent: raw / 256.0,
    })
}

/// EEG channel container for synthetic packet generation.
#[derive(Debug, Clone)]
pub struct EegChannels {
    channels: [[f32; spec::EEG_SAMPLES_PER_CHANNEL]; spec::EEG_CHANNEL_COUNT],
}

impl Default for EegChannels {
    fn default() -> Self {
        Self {
            channels: [[0.0; spec::EEG_SAMPLES_PER_CHANNEL]; spec::EEG_CHANNEL_COUNT],
        }
    }
}

impl EegChannels {
    pub fn set_channel(&mut self, idx: usize, samples: [f32; spec::EEG_SAMPLES_PER_CHANNEL]) {
        if idx < spec::EEG_CHANNEL_COUNT {
            self.channels[idx] = samples;
        }
    }

    pub fn channel(&self, idx: usize) -> Option<&[f32]> {
        self.channels.get(idx).map(|v| v.as_slice())
    }
}

/// Encode an Athena EEG8 packet (single-packet message).
///
/// This returns a full BLE notification payload containing one packet.
pub fn encode_eeg_packet(seq: u16, channels: &EegChannels) -> Vec<u8> {
    let mut values = Vec::with_capacity(spec::EEG_CHANNEL_COUNT * spec::EEG_SAMPLES_PER_CHANNEL);
    for sample_idx in 0..spec::EEG_SAMPLES_PER_CHANNEL {
        for ch in 0..spec::EEG_CHANNEL_COUNT {
            let uv = channels.channels[ch][sample_idx];
            let raw = (uv / EEG_SCALE).round().clamp(0.0, 16383.0) as u16;
            values.push(raw);
        }
    }

    let data = pack_packed_le(&values, 14);

    // Build packet header
    let pkt_len = (PACKET_HEADER_SIZE + data.len()) as u8;
    let pkt_index = (seq & 0xFF) as u8;
    let pkt_time_raw = seq as u32;

    let mut packet = Vec::with_capacity(pkt_len as usize);
    packet.push(pkt_len);
    packet.push(pkt_index);
    packet.extend_from_slice(&pkt_time_raw.to_le_bytes());
    packet.extend_from_slice(&[0u8; 3]); // unknown1
    packet.push(0x12); // EEG8 tag
    packet.extend_from_slice(&[0u8; 3]); // unknown2
    packet.push(0u8); // byte 13
    packet.extend_from_slice(&data);
    packet
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_packet(tag: u8, data: &[u8], pkt_index: u8, pkt_time_raw: u32) -> Vec<u8> {
        let pkt_len = (PACKET_HEADER_SIZE + data.len()) as u8;
        let mut packet = Vec::with_capacity(pkt_len as usize);
        packet.push(pkt_len);
        packet.push(pkt_index);
        packet.extend_from_slice(&pkt_time_raw.to_le_bytes());
        packet.extend_from_slice(&[0u8; 3]); // unknown1
        packet.push(tag);
        packet.extend_from_slice(&[0u8; 3]); // unknown2
        packet.push(0u8); // byte 13
        packet.extend_from_slice(data);
        packet
    }

    #[test]
    fn test_eeg8_encode_decode_roundtrip() {
        let mut channels = EegChannels::default();
        for ch in 0..spec::EEG_CHANNEL_COUNT {
            let samples = [ch as f32 * 10.0 + 1.0, ch as f32 * 10.0 + 2.0];
            channels.set_channel(ch, samples);
        }

        let payload = encode_eeg_packet(7, &channels);
        let packets = decode_message(&payload);
        let eeg = packets
            .into_iter()
            .find_map(|p| match p {
                AthenaPacket::Eeg(frame) => Some(frame),
                _ => None,
            })
            .expect("expected EEG frame");

        assert_eq!(eeg.channel_count(), 8);
        assert_eq!(eeg.samples_per_channel(), 2);

        for ch in 0..spec::EEG_CHANNEL_COUNT {
            let expected = [ch as f32 * 10.0 + 1.0, ch as f32 * 10.0 + 2.0];
            let got = eeg.channel(ch).expect("channel");
            assert_eq!(got.len(), expected.len());
            for (g, e) in got.iter().zip(expected.iter()) {
                assert!((g - e).abs() < 1.0);
            }
        }
    }

    #[test]
    fn test_accgyro_decode() {
        // 18 int16 values (3 samples x 6 channels)
        let raw: [i16; 18] = [
            100, -100, 200, -200, 300, -300, // sample 0
            400, -400, 500, -500, 600, -600, // sample 1
            700, -700, 800, -800, 900, -900, // sample 2
        ];
        let mut data = Vec::with_capacity(36);
        for v in raw {
            data.extend_from_slice(&v.to_le_bytes());
        }

        let payload = build_packet(0x47, &data, 1, 1234);
        let packets = decode_message(&payload);
        let acc = packets
            .into_iter()
            .find_map(|p| match p {
                AthenaPacket::AccGyro(frame) => Some(frame),
                _ => None,
            })
            .expect("expected ACC/GYRO frame");

        assert_eq!(acc.samples.len(), 3);
        // Spot-check scaling for first sample
        assert!((acc.samples[0][0] - (100.0 * ACC_SCALE)).abs() < 1e-6);
        assert!((acc.samples[0][3] - (-200.0 * GYRO_SCALE)).abs() < 1e-6);
    }
}
