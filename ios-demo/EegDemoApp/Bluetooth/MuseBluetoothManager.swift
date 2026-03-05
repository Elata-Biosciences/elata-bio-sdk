import Foundation
import CoreBluetooth
import Combine

/// Connection state for Muse device
enum MuseConnectionState: Equatable {
    case disconnected
    case scanning
    case connecting
    case connected
    case streaming
    case error(String)

    var description: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .scanning: return "Scanning..."
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .streaming: return "Streaming"
        case .error(let msg): return "Error: \(msg)"
        }
    }
}

/// Manages CoreBluetooth connection to Muse EEG headband
class MuseBluetoothManager: NSObject, ObservableObject {
    // MARK: - Published State

    @Published private(set) var connectionState: MuseConnectionState = .disconnected
    @Published private(set) var deviceName: String = ""
    @Published private(set) var rssi: Int = 0

    // MARK: - Data Callback

    /// Called when new EEG samples are available
    /// Provides interleaved samples: [ch0_s0, ch1_s0, ch2_s0, ch3_s0, ch0_s1, ...]
    var onEegData: (([Float]) -> Void)?

    // MARK: - Private Properties

    private var centralManager: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var commandCharacteristic: CBCharacteristic?
    private var eegCharacteristics: [CBUUID: CBCharacteristic] = [:]

    private let channelBuffer = MuseChannelBuffer()
    private let processingQueue = DispatchQueue(label: "com.eegsdk.muse.processing", qos: .userInteractive)

    /// Minimum samples to accumulate before callback (256 Hz * 0.25s = 64 samples)
    private let minSamplesForCallback = 64

    // MARK: - Initialization

    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }

    // MARK: - Public Methods

    /// Start scanning for Muse devices
    func startScanning() {
        guard centralManager.state == .poweredOn else {
            connectionState = .error("Bluetooth not available")
            return
        }

        connectionState = .scanning
        centralManager.scanForPeripherals(
            withServices: [MuseUUID.service],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )

        // Auto-stop scan after 30 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            if self?.connectionState == .scanning {
                self?.stopScanning()
                self?.connectionState = .error("No Muse device found")
            }
        }
    }

    /// Stop scanning for devices
    func stopScanning() {
        centralManager.stopScan()
        if connectionState == .scanning {
            connectionState = .disconnected
        }
    }

    /// Disconnect from current device
    func disconnect() {
        if let peripheral = peripheral {
            centralManager.cancelPeripheralConnection(peripheral)
        }
        cleanup()
    }

    /// Start EEG data streaming
    func startStreaming() {
        guard connectionState == .connected,
              let commandChar = commandCharacteristic,
              let peripheral = peripheral else {
            return
        }

        // Clear buffers
        channelBuffer.clear()

        // Subscribe to all EEG characteristics
        for (_, char) in eegCharacteristics {
            peripheral.setNotifyValue(true, for: char)
        }

        // Send Muse start commands
        sendCommand(MuseCommand.setPreset, to: peripheral, char: commandChar)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            guard let self = self, let peripheral = self.peripheral, let char = self.commandCharacteristic else { return }
            self.sendCommand(MuseCommand.enableAux, to: peripheral, char: char)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            guard let self = self, let peripheral = self.peripheral, let char = self.commandCharacteristic else { return }
            self.sendCommand(MuseCommand.startStream, to: peripheral, char: char)
            self.connectionState = .streaming
        }
    }

    /// Stop EEG data streaming
    func stopStreaming() {
        guard let peripheral = peripheral,
              let commandChar = commandCharacteristic else {
            return
        }

        // Send stop command
        sendCommand(MuseCommand.stopStream, to: peripheral, char: commandChar)

        // Unsubscribe from EEG characteristics
        for (_, char) in eegCharacteristics {
            peripheral.setNotifyValue(false, for: char)
        }

        connectionState = .connected
    }

    // MARK: - Private Methods

    private func sendCommand(_ command: String, to peripheral: CBPeripheral, char: CBCharacteristic) {
        // Muse command format: [length byte] [command string] [newline]
        var bytes = [UInt8]()
        bytes.append(UInt8(command.count + 1)) // Length includes newline
        bytes.append(contentsOf: command.utf8)
        bytes.append(0x0A) // Newline

        let data = Data(bytes)
        peripheral.writeValue(data, for: char, type: .withResponse)
    }

    private func handleEegData(_ data: Data, channel: String) {
        processingQueue.async { [weak self] in
            guard let self = self else { return }

            let samples = MuseDataParser.decodeEegPacket(data)
            self.channelBuffer.addSamples(samples, channel: channel)

            // Check if we have enough samples
            if self.channelBuffer.availableSamples >= self.minSamplesForCallback {
                let interleavedSamples = self.channelBuffer.extractInterleavedSamples(
                    count: self.minSamplesForCallback
                )

                DispatchQueue.main.async {
                    self.onEegData?(interleavedSamples)
                }
            }
        }
    }

    private func cleanup() {
        peripheral = nil
        commandCharacteristic = nil
        eegCharacteristics.removeAll()
        channelBuffer.clear()
        deviceName = ""
        rssi = 0
        connectionState = .disconnected
    }

    private func channelName(for uuid: CBUUID) -> String? {
        switch uuid {
        case MuseUUID.Characteristic.tp9: return "TP9"
        case MuseUUID.Characteristic.af7: return "AF7"
        case MuseUUID.Characteristic.af8: return "AF8"
        case MuseUUID.Characteristic.tp10: return "TP10"
        default: return nil
        }
    }
}

// MARK: - CBCentralManagerDelegate

extension MuseBluetoothManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            // Ready to scan
            break
        case .poweredOff:
            connectionState = .error("Bluetooth is off")
        case .unauthorized:
            connectionState = .error("Bluetooth permission denied")
        case .unsupported:
            connectionState = .error("Bluetooth not supported")
        default:
            break
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        // Found a Muse device - connect to it
        self.peripheral = peripheral
        self.deviceName = peripheral.name ?? "Muse"
        self.rssi = RSSI.intValue

        centralManager.stopScan()
        connectionState = .connecting
        centralManager.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([MuseUUID.service])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connectionState = .error(error?.localizedDescription ?? "Connection failed")
        cleanup()
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        cleanup()
    }
}

// MARK: - CBPeripheralDelegate

extension MuseBluetoothManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil,
              let service = peripheral.services?.first(where: { $0.uuid == MuseUUID.service }) else {
            connectionState = .error("Muse service not found")
            return
        }

        // Discover all characteristics we need
        let charUUIDs = [
            MuseUUID.Characteristic.command,
            MuseUUID.Characteristic.tp9,
            MuseUUID.Characteristic.af7,
            MuseUUID.Characteristic.af8,
            MuseUUID.Characteristic.tp10
        ]
        peripheral.discoverCharacteristics(charUUIDs, for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let characteristics = service.characteristics else {
            connectionState = .error("Failed to discover characteristics")
            return
        }

        for char in characteristics {
            if char.uuid == MuseUUID.Characteristic.command {
                commandCharacteristic = char
            } else if MuseUUID.Characteristic.eegChannels.contains(char.uuid) {
                eegCharacteristics[char.uuid] = char
            }
        }

        // Check if we have all required characteristics
        if commandCharacteristic != nil && eegCharacteristics.count == 4 {
            connectionState = .connected
        } else {
            connectionState = .error("Missing required characteristics")
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, let data = characteristic.value else { return }

        if let channelName = channelName(for: characteristic.uuid) {
            handleEegData(data, channel: channelName)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            print("Write error: \(error.localizedDescription)")
        }
    }
}
