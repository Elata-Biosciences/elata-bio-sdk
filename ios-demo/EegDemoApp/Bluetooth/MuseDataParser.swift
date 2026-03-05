import Foundation

/// Parses raw Muse EEG packets into sample values
struct MuseDataParser {
    /// Decode a 20-byte Muse EEG packet into 12 samples (in microvolts)
    /// Packet format: 2 header bytes + 18 data bytes (12 x 12-bit samples packed)
    static func decodeEegPacket(_ data: Data) -> [Float] {
        guard data.count >= 20 else { return [] }

        var samples: [Float] = []
        samples.reserveCapacity(12)

        // Skip first 2 bytes (packet header/sequence)
        // Remaining 18 bytes contain 12 x 12-bit samples packed as:
        // [byte0][byte1][byte2] -> sample0 (12 bits), sample1 (12 bits)
        for i in stride(from: 2, to: min(data.count, 20) - 2, by: 3) {
            let b0 = UInt16(data[i])
            let b1 = UInt16(data[i + 1])
            let b2 = UInt16(data[i + 2])

            // First 12-bit value: b0[7:0] + b1[7:4]
            let v1Raw = (b0 << 4) | (b1 >> 4)
            // Second 12-bit value: b1[3:0] + b2[7:0]
            let v2Raw = ((b1 & 0x0F) << 8) | b2

            // Convert to microvolts (12-bit ADC centered at 0x800)
            // Scale factor: 125.0 / 256.0 uV per LSB
            let v1 = Float(Int16(v1Raw) - 0x800) * 125.0 / 256.0
            let v2 = Float(Int16(v2Raw) - 0x800) * 125.0 / 256.0

            samples.append(v1)
            samples.append(v2)
        }

        return samples
    }
}

/// Buffers EEG data from multiple Muse channels and emits aligned samples
class MuseChannelBuffer {
    private var buffers: [String: [Float]] = [
        "TP9": [],
        "AF7": [],
        "AF8": [],
        "TP10": []
    ]

    private let lock = NSLock()

    /// Add samples for a specific channel
    func addSamples(_ samples: [Float], channel: String) {
        lock.lock()
        defer { lock.unlock() }
        buffers[channel]?.append(contentsOf: samples)
    }

    /// Get the minimum number of samples available across all channels
    var availableSamples: Int {
        lock.lock()
        defer { lock.unlock() }
        return buffers.values.map { $0.count }.min() ?? 0
    }

    /// Extract aligned samples from all channels
    /// Returns array of [TP9, AF7, AF8, TP10] sample arrays (interleaved)
    func extractSamples(count: Int) -> [[Float]] {
        lock.lock()
        defer { lock.unlock() }

        let actualCount = min(count, availableSamples)
        guard actualCount > 0 else { return [] }

        var result: [[Float]] = []
        result.reserveCapacity(actualCount)

        for i in 0..<actualCount {
            let sample: [Float] = [
                buffers["TP9"]![i],
                buffers["AF7"]![i],
                buffers["AF8"]![i],
                buffers["TP10"]![i]
            ]
            result.append(sample)
        }

        // Remove extracted samples from buffers
        for key in buffers.keys {
            buffers[key]?.removeFirst(actualCount)
        }

        return result
    }

    /// Extract samples as interleaved flat array [ch0_s0, ch1_s0, ch2_s0, ch3_s0, ch0_s1, ...]
    func extractInterleavedSamples(count: Int) -> [Float] {
        let samples = extractSamples(count: count)
        return samples.flatMap { $0 }
    }

    /// Clear all buffers
    func clear() {
        lock.lock()
        defer { lock.unlock() }
        for key in buffers.keys {
            buffers[key]?.removeAll()
        }
    }
}
