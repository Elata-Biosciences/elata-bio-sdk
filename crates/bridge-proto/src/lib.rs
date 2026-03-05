pub const SERVICE_UUID: &str = "2e8a0001-6d29-4f5d-9d42-8be0a8e0b1f4";
pub const EEG_STREAM_CHAR_UUID: &str = "2e8a0002-6d29-4f5d-9d42-8be0a8e0b1f4";
pub const INFO_CHAR_UUID: &str = "2e8a0003-6d29-4f5d-9d42-8be0a8e0b1f4";
pub const SERVICE_UUID_U128: u128 = 0x2e8a0001_6d29_4f5d_9d42_8be0a8e0b1f4;
pub const EEG_STREAM_CHAR_UUID_U128: u128 = 0x2e8a0002_6d29_4f5d_9d42_8be0a8e0b1f4;
pub const INFO_CHAR_UUID_U128: u128 = 0x2e8a0003_6d29_4f5d_9d42_8be0a8e0b1f4;

pub const PACKET_VERSION: u8 = 1;
pub const HEADER_LEN: usize = 1 + 1 + 2 + 2 + 4 + 8;

#[derive(Debug, Clone, PartialEq)]
pub struct EegPacket {
    pub version: u8,
    pub channel_count: u8,
    pub sample_rate_hz: u16,
    pub samples_per_channel: u16,
    pub sequence: u32,
    pub timestamp_ms: u64,
    pub data: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct InfoPayload {
    pub device_name: &'static str,
    pub channel_count: u8,
    pub sample_rate_hz: u16,
    pub samples_per_channel: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DecodeError {
    TooShort,
    InvalidLength { expected: usize, actual: usize },
}

impl std::fmt::Display for DecodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecodeError::TooShort => write!(f, "packet too short"),
            DecodeError::InvalidLength { expected, actual } => {
                write!(
                    f,
                    "invalid packet length: expected {expected}, got {actual}"
                )
            }
        }
    }
}

impl std::error::Error for DecodeError {}

impl EegPacket {
    pub fn expected_sample_count(&self) -> usize {
        self.channel_count as usize * self.samples_per_channel as usize
    }
}

pub fn packet_len(channel_count: u8, samples_per_channel: u16) -> usize {
    HEADER_LEN + (channel_count as usize * samples_per_channel as usize * 4)
}

pub fn encode_packet(packet: &EegPacket, dst: &mut Vec<u8>) {
    dst.clear();
    dst.reserve(packet_len(packet.channel_count, packet.samples_per_channel));

    dst.push(packet.version);
    dst.push(packet.channel_count);
    dst.extend_from_slice(&packet.sample_rate_hz.to_le_bytes());
    dst.extend_from_slice(&packet.samples_per_channel.to_le_bytes());
    dst.extend_from_slice(&packet.sequence.to_le_bytes());
    dst.extend_from_slice(&packet.timestamp_ms.to_le_bytes());

    for sample in &packet.data {
        dst.extend_from_slice(&sample.to_le_bytes());
    }
}

pub fn decode_packet(src: &[u8]) -> Result<EegPacket, DecodeError> {
    if src.len() < HEADER_LEN {
        return Err(DecodeError::TooShort);
    }

    let version = src[0];
    let channel_count = src[1];
    let sample_rate_hz = u16::from_le_bytes([src[2], src[3]]);
    let samples_per_channel = u16::from_le_bytes([src[4], src[5]]);
    let sequence = u32::from_le_bytes([src[6], src[7], src[8], src[9]]);
    let timestamp_ms = u64::from_le_bytes([
        src[10], src[11], src[12], src[13], src[14], src[15], src[16], src[17],
    ]);

    let expected = packet_len(channel_count, samples_per_channel);
    if src.len() != expected {
        return Err(DecodeError::InvalidLength {
            expected,
            actual: src.len(),
        });
    }

    let data_start = HEADER_LEN;
    let mut data = Vec::with_capacity((src.len() - data_start) / 4);
    for chunk in src[data_start..].chunks_exact(4) {
        data.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }

    Ok(EegPacket {
        version,
        channel_count,
        sample_rate_hz,
        samples_per_channel,
        sequence,
        timestamp_ms,
        data,
    })
}

pub fn encode_info_json(info: &InfoPayload) -> String {
    let name = escape_json(info.device_name);
    format!(
        "{{\"device_name\":\"{name}\",\"channel_count\":{},\"sample_rate_hz\":{},\"samples_per_channel\":{}}}",
        info.channel_count, info.sample_rate_hz, info.samples_per_channel
    )
}

fn escape_json(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packet_roundtrip() {
        let packet = EegPacket {
            version: PACKET_VERSION,
            channel_count: 2,
            sample_rate_hz: 256,
            samples_per_channel: 2,
            sequence: 7,
            timestamp_ms: 1234,
            data: vec![0.1, 0.2, 0.3, 0.4],
        };

        let mut encoded = Vec::new();
        encode_packet(&packet, &mut encoded);

        let decoded = decode_packet(&encoded).expect("decode");
        assert_eq!(packet, decoded);
    }

    #[test]
    fn info_json_encoding() {
        let info = InfoPayload {
            device_name: "Synthetic",
            channel_count: 4,
            sample_rate_hz: 256,
            samples_per_channel: 16,
        };

        let json = encode_info_json(&info);
        assert_eq!(
            json,
            "{\"device_name\":\"Synthetic\",\"channel_count\":4,\"sample_rate_hz\":256,\"samples_per_channel\":16}"
        );
    }
}
