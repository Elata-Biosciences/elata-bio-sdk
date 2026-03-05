import SwiftUI
import EegSdkSwift

/// iOS app demonstrating EEG SDK with Muse BLE support
struct ContentView: View {
    @StateObject private var museManager = MuseBluetoothManager()

    @State private var alphaState: String = "Unknown"
    @State private var calmnessScore: Float = 0.0
    @State private var bandPowers: (delta: Float, theta: Float, alpha: Float, beta: Float, gamma: Float)?
    @State private var selectedSource: DataSource = .synthetic

    // EEG SDK components
    private let detector = AlphaBumpDetector(sampleRate: 256, channelCount: 4)
    private let calmnessModel = CalmnessModel(sampleRate: 256, channelCount: 4)
    private let processor = SignalProcessor(sampleRate: 256)

    enum DataSource: String, CaseIterable {
        case synthetic = "Synthetic"
        case muse = "Muse (BLE)"
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
                    // Source selector and controls
                    sourceControlCard

                    // Status card
                    statusCard

                    // Alpha state card
                    alphaStateCard

                    // Calmness score card
                    calmnessCard

                    // Band powers card
                    if bandPowers != nil {
                        bandPowersCard
                    }
                }
                .padding()
            }
            .navigationTitle("EEG SDK Demo")
        }
        .onAppear {
            setupMuseCallback()
        }
    }

    // MARK: - View Components

    private var sourceControlCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Data Source")
                .font(.headline)

            Picker("Source", selection: $selectedSource) {
                ForEach(DataSource.allCases, id: \.self) { source in
                    Text(source.rawValue).tag(source)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: selectedSource) { _ in
                // Disconnect when switching sources
                if museManager.connectionState != .disconnected {
                    museManager.disconnect()
                }
                resetState()
            }

            // Action buttons based on source and state
            HStack(spacing: 12) {
                if selectedSource == .synthetic {
                    Button("Simulate Data") {
                        simulateData()
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    // Muse controls
                    switch museManager.connectionState {
                    case .disconnected, .error:
                        Button("Scan for Muse") {
                            museManager.startScanning()
                        }
                        .buttonStyle(.borderedProminent)

                    case .scanning:
                        Button("Stop Scan") {
                            museManager.stopScanning()
                        }
                        .buttonStyle(.bordered)

                    case .connecting:
                        ProgressView()
                            .padding(.horizontal)

                    case .connected:
                        Button("Start Stream") {
                            museManager.startStreaming()
                        }
                        .buttonStyle(.borderedProminent)

                        Button("Disconnect") {
                            museManager.disconnect()
                        }
                        .buttonStyle(.bordered)

                    case .streaming:
                        Button("Stop Stream") {
                            museManager.stopStreaming()
                        }
                        .buttonStyle(.bordered)

                        Button("Disconnect") {
                            museManager.disconnect()
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Status")
                .font(.headline)

            HStack {
                Circle()
                    .fill(statusColor)
                    .frame(width: 12, height: 12)
                Text(statusText)
                    .foregroundColor(.secondary)
            }

            if selectedSource == .muse && !museManager.deviceName.isEmpty {
                HStack {
                    Text("Device:")
                        .foregroundColor(.secondary)
                    Text(museManager.deviceName)
                        .fontWeight(.medium)
                    if museManager.rssi != 0 {
                        Text("(\(museManager.rssi) dBm)")
                            .foregroundColor(.secondary)
                            .font(.caption)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private var alphaStateCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Alpha State")
                .font(.headline)

            Text(alphaState)
                .font(.largeTitle)
                .fontWeight(.bold)
                .foregroundColor(alphaStateColor)

            Text(alphaStateDescription)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private var calmnessCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Calmness Score")
                .font(.headline)

            HStack {
                Text(String(format: "%.0f%%", calmnessScore * 100))
                    .font(.largeTitle)
                    .fontWeight(.bold)

                Spacer()

                ProgressView(value: Double(calmnessScore))
                    .progressViewStyle(.linear)
                    .frame(width: 120)
                    .tint(calmnessColor)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private var bandPowersCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Band Powers")
                .font(.headline)

            if let powers = bandPowers {
                BandPowerRow(name: "Delta", value: powers.delta, color: .purple)
                BandPowerRow(name: "Theta", value: powers.theta, color: .blue)
                BandPowerRow(name: "Alpha", value: powers.alpha, color: .green)
                BandPowerRow(name: "Beta", value: powers.beta, color: .orange)
                BandPowerRow(name: "Gamma", value: powers.gamma, color: .red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Computed Properties

    private var statusColor: Color {
        switch museManager.connectionState {
        case .streaming: return .green
        case .connected: return .blue
        case .scanning, .connecting: return .orange
        case .error: return .red
        case .disconnected:
            return selectedSource == .synthetic ? .gray : .gray
        }
    }

    private var statusText: String {
        if selectedSource == .synthetic {
            return "Ready (Synthetic Mode)"
        }
        return museManager.connectionState.description
    }

    private var alphaStateColor: Color {
        switch alphaState {
        case "High": return .green
        case "Low": return .orange
        case "Transitioning": return .yellow
        default: return .gray
        }
    }

    private var alphaStateDescription: String {
        switch alphaState {
        case "High": return "Relaxed, eyes likely closed"
        case "Low": return "Alert, eyes likely open"
        case "Transitioning": return "State changing..."
        default: return "Calibrating..."
        }
    }

    private var calmnessColor: Color {
        if calmnessScore > 0.7 { return .green }
        if calmnessScore > 0.4 { return .yellow }
        return .orange
    }

    // MARK: - Methods

    private func setupMuseCallback() {
        museManager.onEegData = { [self] interleavedData in
            processEegData(interleavedData)
        }
    }

    private func processEegData(_ interleavedData: [Float]) {
        let channelCount = 4

        // Extract single channel for band power computation
        let singleChannel = stride(from: 0, to: interleavedData.count, by: channelCount)
            .map { interleavedData[$0] }

        guard singleChannel.count >= 64 else { return }

        do {
            // Compute band powers using SDK
            let powers = try processor.computeBandPowers(data: singleChannel)
            bandPowers = (powers.delta, powers.theta, powers.alpha, powers.beta, powers.gamma)

            // Run alpha bump detector
            if let result = try detector.process(interleavedData: interleavedData) {
                switch result.state {
                case .high: alphaState = "High"
                case .low: alphaState = "Low"
                case .transitioning: alphaState = "Transitioning"
                case .unknown: alphaState = "Unknown"
                }
            }

            // Run calmness model
            if let result = try calmnessModel.process(interleavedData: interleavedData) {
                calmnessScore = result.smoothedScore
            }
        } catch {
            print("Error processing EEG data: \(error)")
        }
    }

    private func simulateData() {
        let sampleRate: Float = 256.0
        let duration: Float = 0.25
        let sampleCount = Int(sampleRate * duration)
        let channelCount = 4

        var interleavedData: [Float] = []
        for i in 0..<sampleCount {
            let t = Float(i) / sampleRate
            for _ in 0..<channelCount {
                let alpha = sin(2 * .pi * 10 * t) * 10
                let beta = sin(2 * .pi * 20 * t) * 3
                let theta = sin(2 * .pi * 6 * t) * 5
                let noise = Float.random(in: -2...2)
                interleavedData.append(alpha + beta + theta + noise)
            }
        }

        processEegData(interleavedData)
    }

    private func resetState() {
        alphaState = "Unknown"
        calmnessScore = 0.0
        bandPowers = nil
    }
}

struct BandPowerRow: View {
    let name: String
    let value: Float
    let color: Color

    private var maxValue: Float { 50.0 }

    var body: some View {
        HStack {
            Text(name)
                .frame(width: 60, alignment: .leading)
                .foregroundColor(.secondary)

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color(.systemGray4))
                        .frame(height: 8)
                        .cornerRadius(4)

                    Rectangle()
                        .fill(color)
                        .frame(width: geometry.size.width * CGFloat(min(value / maxValue, 1.0)), height: 8)
                        .cornerRadius(4)
                }
            }
            .frame(height: 8)

            Text(String(format: "%.1f", value))
                .frame(width: 40, alignment: .trailing)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
