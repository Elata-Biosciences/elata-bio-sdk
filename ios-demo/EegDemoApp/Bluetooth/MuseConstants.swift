import Foundation
import CoreBluetooth

/// Muse BLE service and characteristic UUIDs
enum MuseUUID {
    /// Primary Muse service UUID
    static let service = CBUUID(string: "0000fe8d-0000-1000-8000-00805f9b34fb")

    /// Characteristic UUIDs
    enum Characteristic {
        static let command = CBUUID(string: "273e0001-4c4d-454d-96be-f03bac821358")
        static let tp9     = CBUUID(string: "273e0003-4c4d-454d-96be-f03bac821358")
        static let af7     = CBUUID(string: "273e0004-4c4d-454d-96be-f03bac821358")
        static let af8     = CBUUID(string: "273e0005-4c4d-454d-96be-f03bac821358")
        static let tp10    = CBUUID(string: "273e0006-4c4d-454d-96be-f03bac821358")
        static let rightAux = CBUUID(string: "273e0007-4c4d-454d-96be-f03bac821358")
        static let gyro    = CBUUID(string: "273e0009-4c4d-454d-96be-f03bac821358")
        static let accel   = CBUUID(string: "273e000a-4c4d-454d-96be-f03bac821358")
        static let telemetry = CBUUID(string: "273e000b-4c4d-454d-96be-f03bac821358")

        /// All EEG channel characteristics
        static let eegChannels: [CBUUID] = [tp9, af7, af8, tp10]
    }
}

/// Muse board specifications
enum MuseSpec {
    static let sampleRate: UInt16 = 256
    static let channelCount: Int = 4
    static let channelNames = ["TP9", "AF7", "AF8", "TP10"]

    /// Samples per EEG packet (20 bytes = 12 samples per channel)
    static let samplesPerPacket = 12
}

/// Muse device commands
enum MuseCommand {
    /// Set preset v1 (default EEG mode)
    static let setPreset = "v1"
    /// Enable PPG/aux channels
    static let enableAux = "p21"
    /// Start data streaming
    static let startStream = "d"
    /// Stop data streaming
    static let stopStream = "h"
    /// Request device info
    static let deviceInfo = "?"
}
