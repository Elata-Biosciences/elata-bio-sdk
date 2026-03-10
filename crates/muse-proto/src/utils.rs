/// Bit-level utilities for packed little-endian (LSB-first) streams.
///
/// The Athena protocol packs 14-bit (EEG) and 20-bit (optics) values LSB-first.
/// This helper avoids allocating a `Vec<bool>` by extracting bits directly.
pub fn extract_packed_le(data: &[u8], bit_start: usize, bit_width: usize) -> u32 {
    let mut value = 0u32;
    for i in 0..bit_width {
        let bit_idx = bit_start + i;
        let byte = data[bit_idx >> 3];
        let bit = (byte >> (bit_idx & 7)) & 1;
        value |= (bit as u32) << i;
    }
    value
}

/// Pack a sequence of values into a little-endian (LSB-first) bitstream.
///
/// `bit_width` specifies how many bits of each value to write.
pub fn pack_packed_le(values: &[u16], bit_width: usize) -> Vec<u8> {
    let total_bits = values.len() * bit_width;
    let mut out = vec![0u8; total_bits.div_ceil(8)];
    let mut bit_idx = 0usize;
    for &value in values {
        for i in 0..bit_width {
            let bit = ((value >> i) & 1) as u8;
            let byte_idx = bit_idx >> 3;
            let bit_pos = bit_idx & 7;
            out[byte_idx] |= bit << bit_pos;
            bit_idx += 1;
        }
    }
    out
}
