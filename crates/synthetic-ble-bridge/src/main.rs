//! Synthetic BLE Bridge
//!
//! A bridge that generates synthetic EEG data and streams it over BLE.
//! Emulates the Muse BLE protocol so browsers can connect via Web Bluetooth.

use std::io::{self, Write};
use std::time::Duration;

use bridge_proto::{encode_info_json, encode_packet, EegPacket, InfoPayload, PACKET_VERSION};
use eeg_hal::{EegDevice, SampleBuffer};
use eeg_hal_synthetic::{NoiseLevel, SignalProfile, SyntheticDevice};
use eeg_models::{AlphaBumpDetector, CalmnessModel, Model, ModelOutput};

const DEFAULT_SAMPLE_RATE_HZ: u16 = 256;
const DEFAULT_CHANNEL_COUNT: usize = 4;
const DEFAULT_SAMPLES_PER_CHANNEL: u16 = 12; // Muse sends 12 samples per packet
const DEVICE_NAME: &str = "Muse-Synthetic";

struct Config {
    sample_rate_hz: u16,
    channel_count: usize,
    samples_per_channel: u16,
    count: Option<u32>,
    raw: bool,
    info_only: bool,
    ble: bool,
    adv_name: Option<String>,
    custom_adv: bool,
    profile: SignalProfile,
    noise: NoiseLevel,
    run_models: bool,
    muse_compat: bool, // Use Muse protocol (default true for BLE)
    athena: bool,      // Use Muse S Athena protocol (multiplexed characteristic)
}

impl Config {
    fn from_args() -> Result<Self, Box<dyn std::error::Error>> {
        Self::from_args_iter(std::env::args().skip(1))
    }

    fn from_args_iter<I>(args: I) -> Result<Self, Box<dyn std::error::Error>>
    where
        I: IntoIterator<Item = String>,
    {
        let mut cfg = Self {
            sample_rate_hz: DEFAULT_SAMPLE_RATE_HZ,
            channel_count: DEFAULT_CHANNEL_COUNT,
            samples_per_channel: DEFAULT_SAMPLES_PER_CHANNEL,
            count: None,
            raw: false,
            info_only: false,
            ble: false,
            adv_name: None,
            custom_adv: false,
            profile: SignalProfile::Relaxed,
            noise: NoiseLevel::Low,
            run_models: false,
            muse_compat: true,
            athena: false,
        };

        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            match arg.as_str() {
                "--rate" => {
                    cfg.sample_rate_hz = take_value(&mut args, "--rate")?.parse()?;
                }
                "--channels" => {
                    cfg.channel_count = take_value(&mut args, "--channels")?.parse()?;
                }
                "--samples-per-channel" => {
                    cfg.samples_per_channel =
                        take_value(&mut args, "--samples-per-channel")?.parse()?;
                }
                "--count" => {
                    cfg.count = Some(take_value(&mut args, "--count")?.parse()?);
                }
                "--raw" => cfg.raw = true,
                "--ble" => cfg.ble = true,
                "--adv-name" => {
                    cfg.adv_name = Some(take_value(&mut args, "--adv-name")?);
                }
                "--custom-adv" => cfg.custom_adv = true,
                "--info" => cfg.info_only = true,
                "--profile" => {
                    let p = take_value(&mut args, "--profile")?;
                    cfg.profile = match p.to_lowercase().as_str() {
                        "relaxed" => SignalProfile::Relaxed,
                        "alert" => SignalProfile::Alert,
                        "drowsy" => SignalProfile::Drowsy,
                        "meditative" => SignalProfile::Meditative,
                        _ => return Err(format!("unknown profile: {p}").into()),
                    };
                }
                "--noise" => {
                    let n = take_value(&mut args, "--noise")?;
                    cfg.noise = match n.to_lowercase().as_str() {
                        "none" => NoiseLevel::None,
                        "low" => NoiseLevel::Low,
                        "medium" => NoiseLevel::Medium,
                        "high" => NoiseLevel::High,
                        _ => return Err(format!("unknown noise level: {n}").into()),
                    };
                }
                "--models" => cfg.run_models = true,
                "--legacy-proto" => cfg.muse_compat = false,
                "--athena" => cfg.athena = true,
                "--help" => {
                    print_help();
                    std::process::exit(0);
                }
                _ => {
                    return Err(format!("unknown arg: {arg}").into());
                }
            }
        }

        if cfg.channel_count == 0 || cfg.sample_rate_hz == 0 || cfg.samples_per_channel == 0 {
            return Err("rate, channels, and samples-per-channel must be > 0".into());
        }
        if cfg.ble && cfg.raw {
            return Err("use either --ble or --raw, not both".into());
        }
        if cfg.athena && !cfg.ble {
            return Err("--athena requires --ble".into());
        }
        if cfg.athena && !cfg.muse_compat {
            return Err("--athena requires Muse protocol (omit --legacy-proto)".into());
        }

        // BLE mode defaults to Muse-compatible settings
        if cfg.ble && cfg.muse_compat {
            if cfg.athena {
                cfg.channel_count = muse_proto::athena::spec::EEG_CHANNEL_COUNT;
                cfg.samples_per_channel = muse_proto::athena::spec::EEG_SAMPLES_PER_CHANNEL as u16;
                cfg.sample_rate_hz = muse_proto::athena::spec::EEG_SAMPLE_RATE;
            } else {
                cfg.channel_count = 4;
                cfg.samples_per_channel = muse_proto::classic::spec::SAMPLES_PER_PACKET as u16;
                cfg.sample_rate_hz = muse_proto::classic::spec::SAMPLE_RATE;
            }
        }

        Ok(cfg)
    }

    fn interval_ms(&self) -> u64 {
        let samples = self.samples_per_channel as u64;
        let rate = self.sample_rate_hz as u64;
        (samples * 1000).saturating_div(rate).max(1)
    }
}

fn take_value(
    args: &mut impl Iterator<Item = String>,
    flag: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    args.next()
        .ok_or_else(|| format!("missing value for {flag}").into())
}

fn print_help() {
    println!("synthetic-ble-bridge - Muse-compatible EEG data generator");
    println!();
    println!("OPTIONS:");
    println!("  --rate <hz>                  Sample rate (default 256)");
    println!("  --channels <n>               Channel count (default 4)");
    println!("  --samples-per-channel <n>    Samples per packet (default 12)");
    println!("  --count <n>                  Send n packets then exit");
    println!("  --raw                        Write binary packets to stdout");
    println!("  --ble                        Use Windows BLE peripheral backend");
    println!("  --adv-name <name>            BLE advertisement name (default Muse-Synthetic)");
    println!("  --info                       Print info JSON and exit");
    println!("  --legacy-proto               Use legacy HAL protocol instead of Muse protocol");
    println!("  --athena                     Use Muse S Athena protocol (multiplexed BLE)");
    println!();
    println!("SIGNAL OPTIONS:");
    println!("  --profile <name>             Signal profile: relaxed, alert, drowsy, meditative");
    println!("  --noise <level>              Noise level: none, low, medium, high");
    println!();
    println!("ANALYSIS:");
    println!("  --models                     Run alpha bump and calmness models");
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::from_args()?;

    if config.info_only {
        let info = InfoPayload {
            device_name: DEVICE_NAME,
            channel_count: config.channel_count as u8,
            sample_rate_hz: config.sample_rate_hz,
            samples_per_channel: config.samples_per_channel,
        };
        println!("{}", encode_info_json(&info));
        return Ok(());
    }

    // Create synthetic device using HAL
    let mut device = if config.ble && config.muse_compat && config.athena {
        SyntheticDevice::muse_athena_like()
    } else if config.ble && config.muse_compat {
        SyntheticDevice::muse_like()
    } else {
        SyntheticDevice::with_config(config.sample_rate_hz, config.channel_count)
    };
    device.set_profile(config.profile);
    device.set_noise_level(config.noise);
    device.set_samples_per_read(config.samples_per_channel as usize);

    // Connect and start streaming
    device.connect()?;
    device.start_stream()?;

    eprintln!(
        "Synthetic EEG: {} channels @ {}Hz, profile={:?}, noise={:?}",
        config.channel_count, config.sample_rate_hz, config.profile, config.noise
    );

    if config.ble {
        if config.muse_compat {
            return run_ble_muse(&config, &mut device);
        } else {
            return run_ble_legacy(&config, &mut device);
        }
    }

    // Create models if requested
    let mut alpha_detector = if config.run_models {
        Some(AlphaBumpDetector::new(config.sample_rate_hz))
    } else {
        None
    };
    let mut calmness_model = if config.run_models {
        Some(CalmnessModel::new(config.sample_rate_hz))
    } else {
        None
    };

    // Buffer for model analysis (needs more data than single packet)
    let mut analysis_buffer = SampleBuffer::new(config.sample_rate_hz, config.channel_count);
    let analysis_window = config.sample_rate_hz as usize; // 1 second window

    stream_packets(&config, &mut device, |packet, buffer| {
        // Output packet data
        if config.raw {
            let mut out = io::stdout();
            out.write_all(packet)?;
            out.flush()?;
        } else {
            println!("{}", to_hex_line(packet));
        }

        // Run models if enabled
        if config.run_models {
            // Add to analysis buffer
            let timestamp = buffer.timestamp(0).unwrap_or(0);

            // Rebuild as interleaved for push
            let sample_count = buffer.sample_count();
            let mut interleaved = Vec::with_capacity(sample_count * config.channel_count);
            for s in 0..sample_count {
                for ch in 0..config.channel_count {
                    interleaved.push(buffer.channel_data(ch)[s]);
                }
            }
            analysis_buffer.push_interleaved(&interleaved, timestamp, config.sample_rate_hz);

            // Keep buffer at analysis window size
            if analysis_buffer.sample_count() > analysis_window * 2 {
                analysis_buffer.retain_recent(analysis_window);
            }

            // Run models when we have enough data
            if analysis_buffer.sample_count() >= analysis_window {
                if let Some(ref mut detector) = alpha_detector {
                    if let Some(output) = detector.process(&analysis_buffer) {
                        eprintln!("  [Alpha] {}", output.description());
                    }
                }
                if let Some(ref mut model) = calmness_model {
                    if let Some(output) = model.process(&analysis_buffer) {
                        eprintln!("  [Calmness] {}", output.description());
                    }
                }
            }
        }

        Ok(())
    })
}

fn to_hex_line(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(&mut out, "{:02x}", b);
    }
    out
}

fn stream_packets<F>(
    config: &Config,
    device: &mut SyntheticDevice,
    mut send: F,
) -> Result<(), Box<dyn std::error::Error>>
where
    F: FnMut(&[u8], &SampleBuffer) -> Result<(), Box<dyn std::error::Error>>,
{
    let interval = Duration::from_millis(config.interval_ms());
    let mut seq: u32 = 0;
    let mut remaining = config.count;
    let mut packet_buffer = Vec::new();
    let mut sample_buffer = SampleBuffer::new(config.sample_rate_hz, config.channel_count);

    loop {
        if let Some(0) = remaining {
            break;
        }

        // Read samples from device
        sample_buffer.clear();
        device.read_samples(&mut sample_buffer)?;

        // Convert to interleaved format for packet
        let sample_count = sample_buffer.sample_count();
        let mut interleaved = Vec::with_capacity(sample_count * config.channel_count);
        for s in 0..sample_count {
            for ch in 0..config.channel_count {
                interleaved.push(sample_buffer.channel_data(ch)[s]);
            }
        }

        let timestamp_ms = sample_buffer.timestamp(0).unwrap_or(0);

        let packet = EegPacket {
            version: PACKET_VERSION,
            channel_count: config.channel_count as u8,
            sample_rate_hz: config.sample_rate_hz,
            samples_per_channel: config.samples_per_channel,
            sequence: seq,
            timestamp_ms,
            data: interleaved,
        };

        encode_packet(&packet, &mut packet_buffer);
        send(&packet_buffer, &sample_buffer)?;

        seq = seq.wrapping_add(1);
        if let Some(ref mut count) = remaining {
            *count = count.saturating_sub(1);
        }

        std::thread::sleep(interval);
    }

    Ok(())
}

/// Run BLE server using Muse-compatible protocol
#[cfg(windows)]
fn run_ble_muse(
    config: &Config,
    device: &mut SyntheticDevice,
) -> Result<(), Box<dyn std::error::Error>> {
    if config.athena {
        run_ble_muse_athena(config, device)
    } else {
        run_ble_muse_classic(config, device)
    }
}

/// Run BLE server using classic Muse protocol (4-channel EEG)
#[cfg(windows)]
fn run_ble_muse_classic(
    config: &Config,
    device: &mut SyntheticDevice,
) -> Result<(), Box<dyn std::error::Error>> {
    use muse_proto::classic::{characteristic, encode_eeg_packet, spec};
    use muse_proto::SERVICE_UUID_U128;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use windows::core::GUID;
    use windows::Devices::Bluetooth::BluetoothError;
    use windows::Devices::Bluetooth::GenericAttributeProfile::{
        GattCharacteristicProperties, GattLocalCharacteristic, GattLocalCharacteristicParameters,
        GattProtectionLevel, GattServiceProvider, GattServiceProviderAdvertisingParameters,
        GattWriteRequestedEventArgs,
    };
    use windows::Foundation::TypedEventHandler;

    // Check Bluetooth adapter
    use windows::Devices::Bluetooth::BluetoothAdapter;
    let adapter = pollster::block_on(BluetoothAdapter::GetDefaultAsync()?)?;
    if !adapter.IsPeripheralRoleSupported()? {
        return Err("Bluetooth adapter does not support peripheral role".into());
    }
    eprintln!("Bluetooth adapter found, peripheral role supported.");

    // Create GATT service with Muse service UUID
    eprintln!("Creating Muse-compatible GATT service...");
    let service_result = pollster::block_on(GattServiceProvider::CreateAsync(GUID::from_u128(
        SERVICE_UUID_U128,
    ))?)?;
    if service_result.Error()? != BluetoothError::Success {
        return Err(format!(
            "Failed to create GATT service: {:?}",
            service_result.Error()?
        )
        .into());
    }
    let provider = service_result.ServiceProvider()?;
    let service = provider.Service()?;
    eprintln!("GATT service created with Muse UUID.");

    // Streaming state
    let streaming = Arc::new(AtomicBool::new(false));

    // Create command characteristic (write)
    eprintln!("Creating command characteristic...");
    let cmd_params = GattLocalCharacteristicParameters::new()?;
    cmd_params.SetCharacteristicProperties(
        GattCharacteristicProperties::Write | GattCharacteristicProperties::WriteWithoutResponse,
    )?;
    cmd_params.SetWriteProtectionLevel(GattProtectionLevel::Plain)?;

    let cmd_result =
        pollster::block_on(service.CreateCharacteristicAsync(
            GUID::from_u128(characteristic::COMMAND_U128),
            &cmd_params,
        )?)?;
    if cmd_result.Error()? != BluetoothError::Success {
        return Err(format!("Failed to create command char: {:?}", cmd_result.Error()?).into());
    }
    let cmd_char = cmd_result.Characteristic()?;

    // Handle command writes
    let streaming_clone = streaming.clone();
    cmd_char.WriteRequested(&TypedEventHandler::new(
        move |_char: &Option<GattLocalCharacteristic>,
              args: &Option<GattWriteRequestedEventArgs>| {
            if let Some(args) = args {
                if let Ok(deferral) = args.GetDeferral() {
                    if let Ok(async_op) = args.GetRequestAsync() {
                        if let Ok(request) = pollster::block_on(async_op) {
                            if let Ok(value) = request.Value() {
                                let len = value.Length().unwrap_or(0) as usize;
                                let mut data = vec![0u8; len];
                                if len > 0 {
                                    if let Ok(reader) =
                                        windows::Storage::Streams::DataReader::FromBuffer(&value)
                                    {
                                        let _ = reader.ReadBytes(&mut data);
                                    }
                                }

                                // Parse command
                                if let Some(cmd) = muse_proto::command::decode(&data) {
                                    match cmd {
                                        "d" => {
                                            eprintln!("Received START command");
                                            streaming_clone.store(true, Ordering::SeqCst);
                                        }
                                        "h" => {
                                            eprintln!("Received STOP command");
                                            streaming_clone.store(false, Ordering::SeqCst);
                                        }
                                        "v1" => {
                                            eprintln!("Received SET_PRESET command");
                                        }
                                        "p21" => {
                                            eprintln!("Received ENABLE_AUX command");
                                        }
                                        other => {
                                            eprintln!("Received unknown command: {}", other);
                                        }
                                    }
                                }
                                let _ = request.Respond();
                            }
                        }
                    }
                    let _ = deferral.Complete();
                }
            }
            Ok(())
        },
    ))?;
    eprintln!("Command characteristic created.");

    // Create EEG channel characteristics (notify)
    let mut eeg_chars: Vec<GattLocalCharacteristic> = Vec::with_capacity(4);
    for (i, &uuid) in characteristic::EEG_CHANNELS.iter().enumerate() {
        eprintln!(
            "Creating EEG characteristic {} ({})...",
            characteristic::EEG_CHANNEL_NAMES[i],
            i
        );
        let params = GattLocalCharacteristicParameters::new()?;
        params.SetCharacteristicProperties(GattCharacteristicProperties::Notify)?;
        params.SetReadProtectionLevel(GattProtectionLevel::Plain)?;

        let result =
            pollster::block_on(service.CreateCharacteristicAsync(GUID::from_u128(uuid), &params)?)?;
        if result.Error()? != BluetoothError::Success {
            return Err(format!("Failed to create EEG char {}: {:?}", i, result.Error()?).into());
        }
        eeg_chars.push(result.Characteristic()?);
    }
    eprintln!("All 4 EEG channel characteristics created.");

    // Start advertising
    eprintln!("Starting advertising...");
    let adv_params = GattServiceProviderAdvertisingParameters::new()?;
    adv_params.SetIsDiscoverable(true)?;
    adv_params.SetIsConnectable(true)?;
    provider.StartAdvertisingWithParameters(&adv_params)?;

    let adv_name = config.adv_name.as_deref().unwrap_or(DEVICE_NAME);
    eprintln!(
        "Muse-compatible BLE server started as '{}'. Waiting for connections...",
        adv_name
    );
    eprintln!("Service UUID: {}", muse_proto::SERVICE_UUID);

    // Streaming loop
    let interval = Duration::from_millis(config.interval_ms());
    let mut seq: u16 = 0;
    let mut sample_buffer = SampleBuffer::new(config.sample_rate_hz, config.channel_count);

    loop {
        // Wait for streaming to be enabled
        if !streaming.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(50));
            continue;
        }

        // Read samples from synthetic device
        sample_buffer.clear();
        device.read_samples(&mut sample_buffer)?;

        // Send Muse packets for each channel
        for ch in 0..spec::CHANNEL_COUNT {
            // Get samples for this channel
            let channel_samples: Vec<f32> = sample_buffer
                .channel_data(ch)
                .iter()
                .take(spec::SAMPLES_PER_PACKET)
                .copied()
                .collect();

            // Encode as Muse packet
            let packet = encode_eeg_packet(seq, &channel_samples);

            // Send notification
            let buffer = buffer_from_bytes(&packet)?;
            let _ = pollster::block_on(eeg_chars[ch].NotifyValueAsync(&buffer)?)?;
        }

        seq = seq.wrapping_add(1);
        std::thread::sleep(interval);
    }
}

/// Run BLE server using Muse S Athena protocol (8-channel EEG, multiplexed)
#[cfg(windows)]
fn run_ble_muse_athena(
    config: &Config,
    device: &mut SyntheticDevice,
) -> Result<(), Box<dyn std::error::Error>> {
    use muse_proto::athena::{characteristic, command, encode_eeg_packet, spec, EegChannels};
    use muse_proto::SERVICE_UUID_U128;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{SystemTime, UNIX_EPOCH};
    use windows::core::GUID;
    use windows::Devices::Bluetooth::BluetoothError;
    use windows::Devices::Bluetooth::GenericAttributeProfile::{
        GattCharacteristicProperties, GattLocalCharacteristic, GattLocalCharacteristicParameters,
        GattProtectionLevel, GattServiceProvider, GattServiceProviderAdvertisingParameters,
        GattWriteRequestedEventArgs,
    };
    use windows::Foundation::TypedEventHandler;

    #[derive(Default)]
    struct AthenaStartState {
        pending: bool,
        last_ms: u128,
    }

    // Check Bluetooth adapter
    use windows::Devices::Bluetooth::BluetoothAdapter;
    let adapter = pollster::block_on(BluetoothAdapter::GetDefaultAsync()?)?;
    if !adapter.IsPeripheralRoleSupported()? {
        return Err("Bluetooth adapter does not support peripheral role".into());
    }
    eprintln!("Bluetooth adapter found, peripheral role supported.");

    // Create GATT service with Muse service UUID
    eprintln!("Creating Muse-compatible GATT service...");
    let service_result = pollster::block_on(GattServiceProvider::CreateAsync(GUID::from_u128(
        SERVICE_UUID_U128,
    ))?)?;
    if service_result.Error()? != BluetoothError::Success {
        return Err(format!(
            "Failed to create GATT service: {:?}",
            service_result.Error()?
        )
        .into());
    }
    let provider = service_result.ServiceProvider()?;
    let service = provider.Service()?;
    eprintln!("GATT service created with Muse UUID.");

    // Streaming state
    let streaming = Arc::new(AtomicBool::new(false));
    let start_state = Arc::new(Mutex::new(AthenaStartState::default()));

    // Create command characteristic (write)
    eprintln!("Creating command characteristic...");
    let cmd_params = GattLocalCharacteristicParameters::new()?;
    cmd_params.SetCharacteristicProperties(
        GattCharacteristicProperties::Write | GattCharacteristicProperties::WriteWithoutResponse,
    )?;
    cmd_params.SetWriteProtectionLevel(GattProtectionLevel::Plain)?;

    let cmd_result =
        pollster::block_on(service.CreateCharacteristicAsync(
            GUID::from_u128(characteristic::COMMAND_U128),
            &cmd_params,
        )?)?;
    if cmd_result.Error()? != BluetoothError::Success {
        return Err(format!("Failed to create command char: {:?}", cmd_result.Error()?).into());
    }
    let cmd_char = cmd_result.Characteristic()?;

    // Handle command writes
    let streaming_clone = streaming.clone();
    let start_state_clone = start_state.clone();
    cmd_char.WriteRequested(&TypedEventHandler::new(
        move |_char: &Option<GattLocalCharacteristic>,
              args: &Option<GattWriteRequestedEventArgs>| {
            if let Some(args) = args {
                if let Ok(deferral) = args.GetDeferral() {
                    if let Ok(async_op) = args.GetRequestAsync() {
                        if let Ok(request) = pollster::block_on(async_op) {
                            if let Ok(value) = request.Value() {
                                let len = value.Length().unwrap_or(0) as usize;
                                let mut data = vec![0u8; len];
                                if len > 0 {
                                    if let Ok(reader) =
                                        windows::Storage::Streams::DataReader::FromBuffer(&value)
                                    {
                                        let _ = reader.ReadBytes(&mut data);
                                    }
                                }

                                // Parse command
                                if let Some(cmd) = muse_proto::command::decode(&data) {
                                    match cmd {
                                        command::START_STREAM => {
                                            let now_ms = SystemTime::now()
                                                .duration_since(UNIX_EPOCH)
                                                .map(|d| d.as_millis())
                                                .unwrap_or(0);
                                            let mut state =
                                                start_state_clone.lock().unwrap_or_else(|e| e.into_inner());
                                            if state.pending && now_ms.saturating_sub(state.last_ms) <= 500 {
                                                eprintln!("Received START command twice; streaming enabled");
                                                streaming_clone.store(true, Ordering::SeqCst);
                                                state.pending = false;
                                            } else {
                                                eprintln!("Received START command; waiting for second");
                                                state.pending = true;
                                                state.last_ms = now_ms;
                                            }
                                        }
                                        command::HALT => {
                                            eprintln!("Received STOP command");
                                            streaming_clone.store(false, Ordering::SeqCst);
                                            if let Ok(mut state) = start_state_clone.lock() {
                                                state.pending = false;
                                            }
                                        }
                                        command::L1 => {
                                            eprintln!("Received L1 command");
                                        }
                                        command::VERSION => {
                                            eprintln!("Received VERSION command");
                                        }
                                        other => {
                                            eprintln!("Received unknown command: {}", other);
                                        }
                                    }
                                }
                                let _ = request.Respond();
                            }
                        }
                    }
                    let _ = deferral.Complete();
                }
            }
            Ok(())
        },
    ))?;
    eprintln!("Command characteristic created.");

    // Create combined sensor characteristic (notify)
    eprintln!("Creating combined sensor characteristic...");
    let sensor_params = GattLocalCharacteristicParameters::new()?;
    sensor_params.SetCharacteristicProperties(GattCharacteristicProperties::Notify)?;
    sensor_params.SetReadProtectionLevel(GattProtectionLevel::Plain)?;

    let sensor_result = pollster::block_on(service.CreateCharacteristicAsync(
        GUID::from_u128(characteristic::SENSOR_COMBINED_U128),
        &sensor_params,
    )?)?;
    if sensor_result.Error()? != BluetoothError::Success {
        return Err(format!(
            "Failed to create combined sensor char: {:?}",
            sensor_result.Error()?
        )
        .into());
    }
    let sensor_char = sensor_result.Characteristic()?;
    eprintln!("Combined sensor characteristic created.");

    // Start advertising
    eprintln!("Starting advertising...");
    let adv_params = GattServiceProviderAdvertisingParameters::new()?;
    adv_params.SetIsDiscoverable(true)?;
    adv_params.SetIsConnectable(true)?;
    provider.StartAdvertisingWithParameters(&adv_params)?;

    let adv_name = config.adv_name.as_deref().unwrap_or(DEVICE_NAME);
    eprintln!(
        "Muse-compatible BLE server started as '{}'. Waiting for connections...",
        adv_name
    );
    eprintln!("Service UUID: {}", muse_proto::SERVICE_UUID);

    // Streaming loop
    let interval = Duration::from_millis(config.interval_ms());
    let mut seq: u16 = 0;
    let mut sample_buffer = SampleBuffer::new(config.sample_rate_hz, config.channel_count);

    loop {
        // Wait for streaming to be enabled
        if !streaming.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(50));
            continue;
        }

        // Read samples from synthetic device
        sample_buffer.clear();
        device.read_samples(&mut sample_buffer)?;

        let mut channels = EegChannels::default();
        for ch in 0..spec::EEG_CHANNEL_COUNT {
            let mut samples = [0.0f32; spec::EEG_SAMPLES_PER_CHANNEL];
            for (i, sample) in sample_buffer
                .channel_data(ch)
                .iter()
                .take(spec::EEG_SAMPLES_PER_CHANNEL)
                .enumerate()
            {
                samples[i] = *sample;
            }
            channels.set_channel(ch, samples);
        }

        let packet = encode_eeg_packet(seq, &channels);
        let buffer = buffer_from_bytes(&packet)?;
        let _ = pollster::block_on(sensor_char.NotifyValueAsync(&buffer)?)?;

        seq = seq.wrapping_add(1);
        std::thread::sleep(interval);
    }
}

/// Run BLE server using legacy HAL protocol
#[cfg(windows)]
fn run_ble_legacy(
    config: &Config,
    device: &mut SyntheticDevice,
) -> Result<(), Box<dyn std::error::Error>> {
    use bridge_proto::{EEG_STREAM_CHAR_UUID_U128, INFO_CHAR_UUID_U128, SERVICE_UUID_U128};
    use windows::core::{GUID, HSTRING};
    use windows::Devices::Bluetooth::Advertisement::{
        BluetoothLEAdvertisementDataSection, BluetoothLEAdvertisementDataTypes,
        BluetoothLEAdvertisementPublisher,
    };
    use windows::Devices::Bluetooth::BluetoothError;
    use windows::Devices::Bluetooth::GenericAttributeProfile::{
        GattCharacteristicProperties, GattLocalCharacteristicParameters, GattProtectionLevel,
        GattServiceProvider, GattServiceProviderAdvertisingParameters,
    };

    fn truncate_utf8(input: &str, max_len: usize) -> String {
        if input.len() <= max_len {
            return input.to_string();
        }
        let mut end = 0;
        for (idx, ch) in input.char_indices() {
            let next = idx + ch.len_utf8();
            if next > max_len {
                break;
            }
            end = next;
        }
        input[..end].to_string()
    }

    fn start_custom_advertisement(
        adv_name: &str,
        include_uuid: bool,
        max_adv_len: usize,
        use_extended: bool,
    ) -> Result<(BluetoothLEAdvertisementPublisher, String, bool), windows::core::Error> {
        const NAME_OVERHEAD: usize = 2;
        const UUID_LEN: usize = 18;
        const RESERVED_LEN: usize = 2;
        let flags_len = if use_extended { 0 } else { 3 };

        let adv_max_len = if use_extended {
            max_adv_len.max(31)
        } else {
            31
        };
        let max_name_with_uuid =
            adv_max_len.saturating_sub(flags_len + NAME_OVERHEAD + UUID_LEN + RESERVED_LEN);
        let max_name_no_uuid = adv_max_len.saturating_sub(flags_len + NAME_OVERHEAD + RESERVED_LEN);

        let mut adv_name = adv_name.to_string();
        let include_uuid = include_uuid && adv_name.as_bytes().len() <= max_name_with_uuid;

        if !include_uuid && adv_name.as_bytes().len() > max_name_no_uuid {
            adv_name = truncate_utf8(&adv_name, max_name_no_uuid);
            eprintln!("Advertisement name too long; truncated to '{adv_name}' to fit the payload.");
        }

        let publisher = BluetoothLEAdvertisementPublisher::new()?;
        let adv = publisher.Advertisement()?;
        publisher.SetUseExtendedAdvertisement(use_extended)?;

        if !use_extended {
            let flags_buffer = buffer_from_bytes(&[0x06])?;
            let flags_type = BluetoothLEAdvertisementDataTypes::Flags()?;
            let flags_section =
                BluetoothLEAdvertisementDataSection::Create(flags_type, &flags_buffer)?;
            adv.DataSections()?.Append(&flags_section)?;
        }

        adv.SetLocalName(&HSTRING::from(&adv_name))?;

        if include_uuid {
            adv.ServiceUuids()?
                .Append(GUID::from_u128(SERVICE_UUID_U128))?;
        }

        publisher.Start()?;
        Ok((publisher, adv_name, include_uuid))
    }

    // Check Bluetooth adapter
    use windows::Devices::Bluetooth::BluetoothAdapter;
    let adapter = pollster::block_on(BluetoothAdapter::GetDefaultAsync()?)?;
    if !adapter.IsPeripheralRoleSupported()? {
        return Err("Bluetooth adapter does not support peripheral role".into());
    }
    eprintln!("Bluetooth adapter found, peripheral role supported.");

    let offload_supported = adapter.IsAdvertisementOffloadSupported().unwrap_or(false);
    let extended_supported = adapter.IsExtendedAdvertisingSupported().unwrap_or(false);
    let max_adv_len = adapter
        .MaxAdvertisementDataLength()
        .map(|v| v as usize)
        .unwrap_or(31);

    eprintln!("Creating legacy GATT service...");
    let service_result = pollster::block_on(GattServiceProvider::CreateAsync(GUID::from_u128(
        SERVICE_UUID_U128,
    ))?)?;
    if service_result.Error()? != BluetoothError::Success {
        return Err(format!(
            "Failed to create GATT service: {:?}",
            service_result.Error()?
        )
        .into());
    }
    let provider = service_result.ServiceProvider()?;
    let service = provider.Service()?;

    let info_name: &'static str = if config.adv_name.is_some() {
        // For custom names, we use "HAL Synthetic" as a fallback since we need 'static
        "HAL Synthetic"
    } else {
        DEVICE_NAME
    };
    let info = InfoPayload {
        device_name: info_name,
        channel_count: config.channel_count as u8,
        sample_rate_hz: config.sample_rate_hz,
        samples_per_channel: config.samples_per_channel,
    };
    let info_json = encode_info_json(&info);

    // Info characteristic
    let info_params = GattLocalCharacteristicParameters::new()?;
    info_params.SetCharacteristicProperties(GattCharacteristicProperties::Read)?;
    info_params.SetReadProtectionLevel(GattProtectionLevel::Plain)?;
    let info_buffer = buffer_from_bytes(info_json.as_bytes())?;
    info_params.SetStaticValue(&info_buffer)?;
    let info_result = pollster::block_on(
        service.CreateCharacteristicAsync(GUID::from_u128(INFO_CHAR_UUID_U128), &info_params)?,
    )?;
    if info_result.Error()? != BluetoothError::Success {
        return Err(format!("Failed to create info char: {:?}", info_result.Error()?).into());
    }

    // Stream characteristic
    let stream_params = GattLocalCharacteristicParameters::new()?;
    stream_params.SetCharacteristicProperties(GattCharacteristicProperties::Notify)?;
    stream_params.SetReadProtectionLevel(GattProtectionLevel::Plain)?;
    let stream_result =
        pollster::block_on(service.CreateCharacteristicAsync(
            GUID::from_u128(EEG_STREAM_CHAR_UUID_U128),
            &stream_params,
        )?)?;
    if stream_result.Error()? != BluetoothError::Success {
        return Err(format!("Failed to create stream char: {:?}", stream_result.Error()?).into());
    }
    let stream_char = stream_result.Characteristic()?;

    // Start advertising
    let advertising = GattServiceProviderAdvertisingParameters::new()?;
    advertising.SetIsDiscoverable(true)?;
    advertising.SetIsConnectable(true)?;
    let adv_name = config.adv_name.as_deref().unwrap_or("HAL Synthetic");

    let _publisher = if config.custom_adv && offload_supported {
        let attempts = if extended_supported {
            vec![true, false]
        } else {
            vec![false]
        };

        let mut publisher = None;
        for &use_extended in &attempts {
            if let Ok((p, name, uuid)) =
                start_custom_advertisement(adv_name, true, max_adv_len, use_extended)
            {
                eprintln!(
                    "Custom advertisement started as '{}' (uuid={}, extended={})",
                    name, uuid, use_extended
                );
                publisher = Some(p);
                break;
            }
        }
        publisher
    } else {
        None
    };

    provider.StartAdvertisingWithParameters(&advertising)?;
    eprintln!("Legacy BLE server started. Waiting for connections...");

    stream_packets(config, device, |packet, _buffer| {
        let buffer = buffer_from_bytes(packet)?;
        let _ = pollster::block_on(stream_char.NotifyValueAsync(&buffer)?)?;
        Ok(())
    })
}

#[cfg(windows)]
fn buffer_from_bytes(
    bytes: &[u8],
) -> Result<windows::Storage::Streams::IBuffer, windows::core::Error> {
    windows::Security::Cryptography::CryptographicBuffer::CreateFromByteArray(bytes)
}

#[cfg(not(windows))]
fn run_ble_muse(
    _config: &Config,
    _device: &mut SyntheticDevice,
) -> Result<(), Box<dyn std::error::Error>> {
    Err("BLE backend is only implemented on Windows".into())
}

#[cfg(not(windows))]
fn run_ble_legacy(
    _config: &Config,
    _device: &mut SyntheticDevice,
) -> Result<(), Box<dyn std::error::Error>> {
    Err("BLE backend is only implemented on Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_args(args: &[&str]) -> Result<Config, Box<dyn std::error::Error>> {
        Config::from_args_iter(args.iter().map(|arg| arg.to_string()))
    }

    #[test]
    fn ble_muse_defaults_override_manual_settings() {
        let cfg = parse_args(&[
            "--ble",
            "--rate",
            "128",
            "--channels",
            "8",
            "--samples-per-channel",
            "20",
        ])
        .expect("config");

        assert_eq!(cfg.sample_rate_hz, muse_proto::classic::spec::SAMPLE_RATE);
        assert_eq!(cfg.channel_count, muse_proto::classic::spec::CHANNEL_COUNT);
        assert_eq!(
            cfg.samples_per_channel,
            muse_proto::classic::spec::SAMPLES_PER_PACKET as u16
        );
    }

    #[test]
    fn ble_legacy_preserves_manual_settings() {
        let cfg = parse_args(&[
            "--ble",
            "--legacy-proto",
            "--rate",
            "128",
            "--channels",
            "8",
            "--samples-per-channel",
            "20",
        ])
        .expect("config");

        assert_eq!(cfg.sample_rate_hz, 128);
        assert_eq!(cfg.channel_count, 8);
        assert_eq!(cfg.samples_per_channel, 20);
    }

    #[test]
    fn ble_athena_defaults_override_manual_settings() {
        let cfg = parse_args(&[
            "--ble",
            "--athena",
            "--rate",
            "128",
            "--channels",
            "8",
            "--samples-per-channel",
            "20",
        ])
        .expect("config");

        assert_eq!(
            cfg.sample_rate_hz,
            muse_proto::athena::spec::EEG_SAMPLE_RATE
        );
        assert_eq!(
            cfg.channel_count,
            muse_proto::athena::spec::EEG_CHANNEL_COUNT
        );
        assert_eq!(
            cfg.samples_per_channel,
            muse_proto::athena::spec::EEG_SAMPLES_PER_CHANNEL as u16
        );
    }

    #[test]
    fn interval_ms_matches_samples_and_rate() {
        let cfg = Config {
            sample_rate_hz: 256,
            channel_count: 4,
            samples_per_channel: 12,
            count: None,
            raw: false,
            info_only: false,
            ble: false,
            adv_name: None,
            custom_adv: false,
            profile: SignalProfile::Relaxed,
            noise: NoiseLevel::Low,
            run_models: false,
            muse_compat: true,
            athena: false,
        };

        assert_eq!(cfg.interval_ms(), 46);
    }

    #[test]
    fn hex_line_encodes_all_bytes() {
        let line = to_hex_line(&[0x00, 0x1a, 0xff]);
        assert_eq!(line, "001aff");
    }

    #[test]
    fn raw_and_ble_are_mutually_exclusive() {
        let err = parse_args(&["--ble", "--raw"])
            .err()
            .expect("expected parse failure");
        assert!(err.to_string().contains("use either --ble or --raw"));
    }
}
