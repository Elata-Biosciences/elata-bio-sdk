//! WASM Athena decoder and clocking utilities.

use wasm_bindgen::prelude::*;

use muse_proto::athena;

const DEVICE_CLOCK_HZ: f64 = 256_000.0;
const CLOCK_MOD: u64 = 1 << 32;
const DEFAULT_REORDER_WINDOW_MS: u64 = 200;
const DEFAULT_MAX_BUFFER_FRAMES: usize = 64;
const PACKET_HEADER_SIZE: usize = 14;

fn current_time_ms() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        js_sys::Date::now() as u64
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }
}

#[derive(Debug, Default, Clone)]
struct TickState {
    base_tick: Option<u64>,
    last_abs_tick: u64,
    wrap_offset: u64,
}

impl TickState {
    fn reset(&mut self) {
        self.base_tick = None;
        self.last_abs_tick = 0;
        self.wrap_offset = 0;
    }

    fn device_time_sec(&mut self, pkt_time_raw: u32) -> f64 {
        let raw = pkt_time_raw as u64;
        let prev_raw = self.last_abs_tick % CLOCK_MOD;
        let mut abs_tick = raw + self.wrap_offset;

        if self.base_tick.is_none() {
            self.base_tick = Some(abs_tick);
            self.last_abs_tick = abs_tick;
            return 0.0;
        }

        if raw < prev_raw {
            if prev_raw - raw > (CLOCK_MOD / 2) {
                self.wrap_offset = self.wrap_offset.saturating_add(CLOCK_MOD);
                abs_tick = raw + self.wrap_offset;
            } else {
                abs_tick = self.last_abs_tick;
            }
        } else if abs_tick < self.last_abs_tick {
            abs_tick = self.last_abs_tick;
        }

        self.last_abs_tick = abs_tick;
        let base_tick = self.base_tick.unwrap_or(abs_tick);
        let delta_ticks = abs_tick.saturating_sub(base_tick);
        delta_ticks as f64 / DEVICE_CLOCK_HZ
    }
}

#[derive(Debug, Default)]
struct WindowedRegressionClock {
    history: std::collections::VecDeque<(f64, f64)>,
    slope: f64,
    intercept: f64,
    initialized: bool,
    last_fit_host_time: f64,
    last_update_device_time: f64,
}

impl WindowedRegressionClock {
    fn reset(&mut self) {
        self.history.clear();
        self.slope = 1.0;
        self.intercept = 0.0;
        self.initialized = false;
        self.last_fit_host_time = 0.0;
        self.last_update_device_time = -1.0;
    }

    fn update(&mut self, device_time: f64, host_time: f64) {
        if device_time <= self.last_update_device_time {
            return;
        }
        self.last_update_device_time = device_time;
        self.history.push_back((device_time, host_time));

        let cutoff = device_time - 30.0;
        while let Some((t, _)) = self.history.front() {
            if *t < cutoff {
                self.history.pop_front();
            } else {
                break;
            }
        }

        let should_fit = (host_time - self.last_fit_host_time) > 1.0
            || (!self.initialized && self.history.len() >= 10);
        if should_fit {
            self.fit();
            self.last_fit_host_time = host_time;
            if self.history.len() >= 10 {
                self.initialized = true;
            }
        }
    }

    fn fit(&mut self) {
        let n = self.history.len();
        if n < 10 {
            return;
        }
        let mut sum_x = 0.0;
        let mut sum_y = 0.0;
        for (x, y) in &self.history {
            sum_x += x;
            sum_y += y;
        }
        let mean_x = sum_x / n as f64;
        let mean_y = sum_y / n as f64;

        let mut num = 0.0;
        let mut den = 0.0;
        for (x, y) in &self.history {
            let dx = x - mean_x;
            let dy = y - mean_y;
            num += dx * dy;
            den += dx * dx;
        }
        if den.abs() < 1e-12 {
            return;
        }
        self.slope = num / den;
        self.intercept = mean_y - self.slope * mean_x;
    }

    fn map_time(&self, device_time: f64) -> f64 {
        if self.initialized {
            self.intercept + (self.slope * device_time)
        } else if let Some((dt, lt)) = self.history.back() {
            device_time + (lt - dt)
        } else {
            device_time
        }
    }
}

#[derive(Debug)]
struct RobustOffsetClock {
    history: std::collections::VecDeque<(f64, f64)>,
    window_seconds: f64,
    percentile: f64,
    ema_alpha: f64,
    offset: f64,
    initialized: bool,
}

impl Default for RobustOffsetClock {
    fn default() -> Self {
        Self {
            history: std::collections::VecDeque::new(),
            window_seconds: 10.0,
            percentile: 10.0,
            ema_alpha: 0.02,
            offset: 0.0,
            initialized: false,
        }
    }
}

impl RobustOffsetClock {
    fn reset(&mut self) {
        *self = Self::default();
    }

    fn update(&mut self, device_time: f64, host_time: f64) {
        let offset = host_time - device_time;
        if !self.initialized {
            self.offset = offset;
            self.initialized = true;
            self.history.push_back((device_time, offset));
            return;
        }

        self.history.push_back((device_time, offset));
        let cutoff = device_time - self.window_seconds;
        while let Some((t, _)) = self.history.front() {
            if *t < cutoff {
                self.history.pop_front();
            } else {
                break;
            }
        }

        if self.history.len() >= 5 {
            let mut offsets: Vec<f64> = self.history.iter().map(|(_, o)| *o).collect();
            offsets.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let idx = ((self.percentile / 100.0) * (offsets.len() as f64 - 1.0)).round() as usize;
            let robust_offset = offsets[idx.min(offsets.len().saturating_sub(1))];
            self.offset = self.ema_alpha * robust_offset + (1.0 - self.ema_alpha) * self.offset;
        } else {
            self.offset = self.ema_alpha * offset + (1.0 - self.ema_alpha) * self.offset;
        }
    }

    fn map_time(&self, device_time: f64) -> f64 {
        if !self.initialized {
            device_time
        } else {
            device_time + self.offset
        }
    }
}

#[derive(Debug)]
struct AdaptiveOffsetClock {
    history: std::collections::VecDeque<(f64, f64)>,
    window_seconds: f64,
    percentile: f64,
    final_alpha: f64,
    current_alpha: f64,
    warmup_packets: usize,
    packets_processed: usize,
    offset: f64,
    initialized: bool,
}

impl Default for AdaptiveOffsetClock {
    fn default() -> Self {
        Self {
            history: std::collections::VecDeque::new(),
            window_seconds: 10.0,
            percentile: 5.0,
            final_alpha: 0.02,
            current_alpha: 1.0,
            warmup_packets: 500,
            packets_processed: 0,
            offset: 0.0,
            initialized: false,
        }
    }
}

impl AdaptiveOffsetClock {
    fn reset(&mut self) {
        *self = Self::default();
    }

    fn update(&mut self, device_time: f64, host_time: f64) {
        let offset = host_time - device_time;
        self.packets_processed += 1;
        if !self.initialized {
            self.offset = offset;
            self.initialized = true;
            self.history.push_back((device_time, offset));
            return;
        }

        self.history.push_back((device_time, offset));
        let cutoff = device_time - self.window_seconds;
        while let Some((t, _)) = self.history.front() {
            if *t < cutoff {
                self.history.pop_front();
            } else {
                break;
            }
        }

        if self.packets_processed < self.warmup_packets {
            let progress = self.packets_processed as f64 / self.warmup_packets as f64;
            self.current_alpha =
                self.current_alpha * (1.0 - progress) + self.final_alpha * progress;
        } else {
            self.current_alpha = self.final_alpha;
        }

        if self.history.len() >= 5 {
            let mut offsets: Vec<f64> = self.history.iter().map(|(_, o)| *o).collect();
            offsets.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            let idx = ((self.percentile / 100.0) * (offsets.len() as f64 - 1.0)).round() as usize;
            let target_offset = offsets[idx.min(offsets.len().saturating_sub(1))];

            let mut effective_alpha = self.current_alpha;
            if target_offset < self.offset {
                effective_alpha = (self.current_alpha * 5.0).min(1.0);
            }

            self.offset = effective_alpha * target_offset + (1.0 - effective_alpha) * self.offset;
        } else {
            self.offset = self.current_alpha * offset + (1.0 - self.current_alpha) * self.offset;
        }
    }

    fn map_time(&self, device_time: f64) -> f64 {
        if !self.initialized {
            device_time
        } else {
            device_time + self.offset
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ClockKind {
    None,
    Windowed,
    Robust,
    Adaptive,
}

#[derive(Debug)]
enum ClockModel {
    None,
    Windowed(WindowedRegressionClock),
    Robust(RobustOffsetClock),
    Adaptive(AdaptiveOffsetClock),
}

impl ClockModel {
    fn new(kind: ClockKind) -> Self {
        match kind {
            ClockKind::None => Self::None,
            ClockKind::Windowed => Self::Windowed(WindowedRegressionClock::default()),
            ClockKind::Robust => Self::Robust(RobustOffsetClock::default()),
            ClockKind::Adaptive => Self::Adaptive(AdaptiveOffsetClock::default()),
        }
    }

    fn reset(&mut self, kind: ClockKind) {
        *self = Self::new(kind);
    }

    fn update(&mut self, device_time: f64, host_time: f64) {
        match self {
            ClockModel::None => {}
            ClockModel::Windowed(clock) => clock.update(device_time, host_time),
            ClockModel::Robust(clock) => clock.update(device_time, host_time),
            ClockModel::Adaptive(clock) => clock.update(device_time, host_time),
        }
    }

    fn map_time(&self, device_time: f64) -> f64 {
        match self {
            ClockModel::None => device_time,
            ClockModel::Windowed(clock) => clock.map_time(device_time),
            ClockModel::Robust(clock) => clock.map_time(device_time),
            ClockModel::Adaptive(clock) => clock.map_time(device_time),
        }
    }
}

#[derive(Debug, Clone)]
struct EegFrameWrap {
    frame: athena::EegFrame,
    arrival_ms: u64,
}

#[derive(Debug, Clone)]
struct AccGyroFrameWrap {
    frame: athena::AccGyroFrame,
    arrival_ms: u64,
}

#[derive(Debug, Clone)]
struct OpticsFrameWrap {
    frame: athena::OpticsFrame,
    arrival_ms: u64,
}

#[derive(Debug, Clone)]
struct BatteryFrameWrap {
    frame: athena::BatterySample,
    arrival_ms: u64,
}

trait ArrivalTimestamp {
    fn arrival_ms(&self) -> u64;
}

impl ArrivalTimestamp for EegFrameWrap {
    fn arrival_ms(&self) -> u64 {
        self.arrival_ms
    }
}

impl ArrivalTimestamp for AccGyroFrameWrap {
    fn arrival_ms(&self) -> u64 {
        self.arrival_ms
    }
}

impl ArrivalTimestamp for OpticsFrameWrap {
    fn arrival_ms(&self) -> u64 {
        self.arrival_ms
    }
}

impl ArrivalTimestamp for BatteryFrameWrap {
    fn arrival_ms(&self) -> u64 {
        self.arrival_ms
    }
}

fn take_ready_frames<T: ArrivalTimestamp>(
    buffer: &mut Vec<T>,
    now_ms: u64,
    window_ms: u64,
    max_frames: usize,
) -> Vec<T> {
    if buffer.is_empty() {
        return Vec::new();
    }

    if window_ms == 0 {
        return buffer.drain(..).collect();
    }

    if buffer.len() <= 1 {
        return buffer.drain(..).collect();
    }

    let cutoff = now_ms.saturating_sub(window_ms);
    let mut ready = Vec::new();
    let mut keep = Vec::new();
    for frame in buffer.drain(..) {
        if frame.arrival_ms() <= cutoff {
            ready.push(frame);
        } else {
            keep.push(frame);
        }
    }

    if ready.is_empty() && keep.len() >= max_frames {
        keep.sort_by_key(|f| f.arrival_ms());
        let flush_count = keep.len().saturating_sub(max_frames / 2).max(1);
        ready.extend(keep.drain(0..flush_count));
    }

    *buffer = keep;
    ready
}

#[wasm_bindgen]
pub struct AthenaWasmOutput {
    eeg_samples: Vec<f32>,
    eeg_timestamps_ms: Vec<f64>,
    eeg_channel_count: usize,
    accgyro_samples: Vec<f32>,
    accgyro_timestamps_ms: Vec<f64>,
    optics_samples: Vec<f32>,
    optics_timestamps_ms: Vec<f64>,
    optics_channel_count: usize,
    battery_samples: Vec<f32>,
    battery_timestamps_ms: Vec<f64>,
}

#[wasm_bindgen]
impl AthenaWasmOutput {
    #[wasm_bindgen(getter)]
    pub fn eeg_samples(&self) -> Vec<f32> {
        self.eeg_samples.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn eeg_timestamps_ms(&self) -> Vec<f64> {
        self.eeg_timestamps_ms.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn eeg_channel_count(&self) -> usize {
        self.eeg_channel_count
    }

    #[wasm_bindgen(getter)]
    pub fn accgyro_samples(&self) -> Vec<f32> {
        self.accgyro_samples.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn accgyro_timestamps_ms(&self) -> Vec<f64> {
        self.accgyro_timestamps_ms.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn optics_samples(&self) -> Vec<f32> {
        self.optics_samples.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn optics_timestamps_ms(&self) -> Vec<f64> {
        self.optics_timestamps_ms.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn optics_channel_count(&self) -> usize {
        self.optics_channel_count
    }

    #[wasm_bindgen(getter)]
    pub fn battery_samples(&self) -> Vec<f32> {
        self.battery_samples.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn battery_timestamps_ms(&self) -> Vec<f64> {
        self.battery_timestamps_ms.clone()
    }
}

#[wasm_bindgen]
pub struct AthenaWasmDecoder {
    use_device_timestamps: bool,
    reorder_window_ms: u64,
    max_buffer_frames: usize,
    clock_kind: ClockKind,
    raw_buffer: Vec<u8>,
    tick_eeg: TickState,
    tick_accgyro: TickState,
    tick_optics: TickState,
    tick_battery: TickState,
    clock_eeg: ClockModel,
    clock_accgyro: ClockModel,
    clock_optics: ClockModel,
    clock_battery: ClockModel,
    pending_eeg: Vec<EegFrameWrap>,
    pending_accgyro: Vec<AccGyroFrameWrap>,
    pending_optics: Vec<OpticsFrameWrap>,
    pending_battery: Vec<BatteryFrameWrap>,
    buffer_eeg: Vec<EegFrameWrap>,
    buffer_accgyro: Vec<AccGyroFrameWrap>,
    buffer_optics: Vec<OpticsFrameWrap>,
    buffer_battery: Vec<BatteryFrameWrap>,
}

#[wasm_bindgen]
impl AthenaWasmDecoder {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let clock_kind = ClockKind::Windowed;
        Self {
            use_device_timestamps: true,
            reorder_window_ms: DEFAULT_REORDER_WINDOW_MS,
            max_buffer_frames: DEFAULT_MAX_BUFFER_FRAMES,
            clock_kind,
            raw_buffer: Vec::new(),
            tick_eeg: TickState::default(),
            tick_accgyro: TickState::default(),
            tick_optics: TickState::default(),
            tick_battery: TickState::default(),
            clock_eeg: ClockModel::new(clock_kind),
            clock_accgyro: ClockModel::new(clock_kind),
            clock_optics: ClockModel::new(clock_kind),
            clock_battery: ClockModel::new(clock_kind),
            pending_eeg: Vec::new(),
            pending_accgyro: Vec::new(),
            pending_optics: Vec::new(),
            pending_battery: Vec::new(),
            buffer_eeg: Vec::new(),
            buffer_accgyro: Vec::new(),
            buffer_optics: Vec::new(),
            buffer_battery: Vec::new(),
        }
    }

    #[wasm_bindgen]
    pub fn set_use_device_timestamps(&mut self, enabled: bool) {
        self.use_device_timestamps = enabled;
    }

    #[wasm_bindgen]
    pub fn set_reorder_window_ms(&mut self, window_ms: u32) {
        self.reorder_window_ms = window_ms as u64;
    }

    #[wasm_bindgen]
    pub fn set_max_buffer_frames(&mut self, max_frames: u32) {
        self.max_buffer_frames = (max_frames as usize).max(1);
    }

    #[wasm_bindgen]
    pub fn set_clock_kind(&mut self, kind: &str) {
        let parsed = match kind.to_lowercase().as_str() {
            "none" => ClockKind::None,
            "robust" => ClockKind::Robust,
            "adaptive" => ClockKind::Adaptive,
            _ => ClockKind::Windowed,
        };
        self.clock_kind = parsed;
        self.clock_eeg.reset(parsed);
        self.clock_accgyro.reset(parsed);
        self.clock_optics.reset(parsed);
        self.clock_battery.reset(parsed);
    }

    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.tick_eeg.reset();
        self.tick_accgyro.reset();
        self.tick_optics.reset();
        self.tick_battery.reset();
        self.raw_buffer.clear();
        self.clock_eeg.reset(self.clock_kind);
        self.clock_accgyro.reset(self.clock_kind);
        self.clock_optics.reset(self.clock_kind);
        self.clock_battery.reset(self.clock_kind);
        self.pending_eeg.clear();
        self.pending_accgyro.clear();
        self.pending_optics.clear();
        self.pending_battery.clear();
        self.buffer_eeg.clear();
        self.buffer_accgyro.clear();
        self.buffer_optics.clear();
        self.buffer_battery.clear();
    }

    #[wasm_bindgen]
    pub fn decode(&mut self, payload: &[u8]) -> AthenaWasmOutput {
        let now_ms = current_time_ms();
        if !payload.is_empty() {
            self.raw_buffer.extend_from_slice(payload);
        }

        let mut complete_payload = Vec::new();
        let mut offset = 0usize;
        while offset < self.raw_buffer.len() {
            let pkt_len = self.raw_buffer[offset] as usize;
            if pkt_len == 0 {
                offset += 1;
                continue;
            }
            if pkt_len < PACKET_HEADER_SIZE {
                offset += 1;
                continue;
            }
            if offset + pkt_len > self.raw_buffer.len() {
                break;
            }
            complete_payload.extend_from_slice(&self.raw_buffer[offset..offset + pkt_len]);
            offset += pkt_len;
        }
        if offset > 0 {
            self.raw_buffer.drain(0..offset);
        }

        let packets = athena::decode_message(&complete_payload);

        for packet in packets {
            match packet {
                athena::AthenaPacket::Eeg(frame) => {
                    self.pending_eeg.push(EegFrameWrap {
                        frame,
                        arrival_ms: now_ms,
                    });
                }
                athena::AthenaPacket::AccGyro(frame) => {
                    self.pending_accgyro.push(AccGyroFrameWrap {
                        frame,
                        arrival_ms: now_ms,
                    });
                }
                athena::AthenaPacket::Optics(frame) => {
                    self.pending_optics.push(OpticsFrameWrap {
                        frame,
                        arrival_ms: now_ms,
                    });
                }
                athena::AthenaPacket::Battery(sample) => {
                    self.pending_battery.push(BatteryFrameWrap {
                        frame: sample,
                        arrival_ms: now_ms,
                    });
                }
                athena::AthenaPacket::Unknown { .. } => {}
            }
        }

        self.buffer_eeg.extend(self.pending_eeg.drain(..));
        self.buffer_accgyro.extend(self.pending_accgyro.drain(..));
        self.buffer_optics.extend(self.pending_optics.drain(..));
        self.buffer_battery.extend(self.pending_battery.drain(..));

        let mut eeg_ready = take_ready_frames(
            &mut self.buffer_eeg,
            now_ms,
            self.reorder_window_ms,
            self.max_buffer_frames,
        );
        eeg_ready.sort_by_key(|f| (f.frame.pkt_time_raw, f.frame.pkt_index));

        let mut acc_ready = take_ready_frames(
            &mut self.buffer_accgyro,
            now_ms,
            self.reorder_window_ms,
            self.max_buffer_frames,
        );
        acc_ready.sort_by_key(|f| (f.frame.pkt_time_raw, f.frame.pkt_index));

        let mut optics_ready = take_ready_frames(
            &mut self.buffer_optics,
            now_ms,
            self.reorder_window_ms,
            self.max_buffer_frames,
        );
        optics_ready.sort_by_key(|f| (f.frame.pkt_time_raw, f.frame.pkt_index));

        let mut battery_ready = take_ready_frames(
            &mut self.buffer_battery,
            now_ms,
            self.reorder_window_ms,
            self.max_buffer_frames,
        );
        battery_ready.sort_by_key(|f| (f.frame.pkt_time_raw, f.frame.pkt_index));

        let mut eeg_samples = Vec::new();
        let mut eeg_timestamps = Vec::new();
        let mut eeg_channel_count = athena::spec::EEG_CHANNEL_COUNT;

        for frame in eeg_ready {
            let channels = frame.frame.channel_count();
            let samples_per_channel = frame.frame.samples_per_channel();
            if channels == 0 || samples_per_channel == 0 {
                continue;
            }
            eeg_channel_count = eeg_channel_count.max(channels);

            let timestamp_start_ms = if self.use_device_timestamps {
                let device_time = self.tick_eeg.device_time_sec(frame.frame.pkt_time_raw);
                let arrival_sec = frame.arrival_ms as f64 / 1000.0;
                self.clock_eeg.update(device_time, arrival_sec);
                (self.clock_eeg.map_time(device_time) * 1000.0) as f64
            } else {
                frame.arrival_ms as f64
            };

            let sample_interval_ms = 1000.0 / athena::spec::EEG_SAMPLE_RATE as f64;
            for sample_idx in 0..samples_per_channel {
                eeg_timestamps.push(timestamp_start_ms + (sample_idx as f64 * sample_interval_ms));
                for ch in 0..eeg_channel_count {
                    if ch < channels {
                        if let Some(channel) = frame.frame.channel(ch) {
                            eeg_samples.push(channel[sample_idx]);
                        } else {
                            eeg_samples.push(0.0);
                        }
                    } else {
                        eeg_samples.push(0.0);
                    }
                }
            }
        }

        let mut accgyro_samples = Vec::new();
        let mut accgyro_timestamps = Vec::new();
        for frame in acc_ready {
            let timestamp_start_ms = if self.use_device_timestamps {
                let device_time = self.tick_accgyro.device_time_sec(frame.frame.pkt_time_raw);
                let arrival_sec = frame.arrival_ms as f64 / 1000.0;
                self.clock_accgyro.update(device_time, arrival_sec);
                (self.clock_accgyro.map_time(device_time) * 1000.0) as f64
            } else {
                frame.arrival_ms as f64
            };

            let sample_interval_ms = 1000.0 / athena::spec::ACCGYRO_SAMPLE_RATE as f64;
            for (idx, sample) in frame.frame.samples.iter().enumerate() {
                accgyro_timestamps.push(timestamp_start_ms + (idx as f64 * sample_interval_ms));
                accgyro_samples.extend_from_slice(sample);
            }
        }

        let mut optics_samples = Vec::new();
        let mut optics_timestamps = Vec::new();
        let mut optics_channel_count = 0usize;

        for frame in optics_ready {
            let channels = frame.frame.channels.len();
            let samples_per_channel = frame.frame.channels.first().map(|c| c.len()).unwrap_or(0);
            if channels == 0 || samples_per_channel == 0 {
                continue;
            }
            optics_channel_count = optics_channel_count.max(channels);

            let timestamp_start_ms = if self.use_device_timestamps {
                let device_time = self.tick_optics.device_time_sec(frame.frame.pkt_time_raw);
                let arrival_sec = frame.arrival_ms as f64 / 1000.0;
                self.clock_optics.update(device_time, arrival_sec);
                (self.clock_optics.map_time(device_time) * 1000.0) as f64
            } else {
                frame.arrival_ms as f64
            };

            let sample_interval_ms = 1000.0 / athena::spec::OPTICS_SAMPLE_RATE as f64;
            for sample_idx in 0..samples_per_channel {
                optics_timestamps
                    .push(timestamp_start_ms + (sample_idx as f64 * sample_interval_ms));
                for ch in 0..optics_channel_count {
                    if ch < channels {
                        optics_samples.push(frame.frame.channels[ch][sample_idx]);
                    } else {
                        optics_samples.push(0.0);
                    }
                }
            }
        }

        let mut battery_samples = Vec::new();
        let mut battery_timestamps = Vec::new();
        for frame in battery_ready {
            let timestamp_ms = if self.use_device_timestamps {
                let device_time = self.tick_battery.device_time_sec(frame.frame.pkt_time_raw);
                let arrival_sec = frame.arrival_ms as f64 / 1000.0;
                self.clock_battery.update(device_time, arrival_sec);
                (self.clock_battery.map_time(device_time) * 1000.0) as f64
            } else {
                frame.arrival_ms as f64
            };
            battery_samples.push(frame.frame.percent);
            battery_timestamps.push(timestamp_ms);
        }

        AthenaWasmOutput {
            eeg_samples,
            eeg_timestamps_ms: eeg_timestamps,
            eeg_channel_count,
            accgyro_samples,
            accgyro_timestamps_ms: accgyro_timestamps,
            optics_samples,
            optics_timestamps_ms: optics_timestamps,
            optics_channel_count,
            battery_samples,
            battery_timestamps_ms: battery_timestamps,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seed_eeg_channels() -> athena::EegChannels {
        let mut channels = athena::EegChannels::default();
        for ch in 0..athena::spec::EEG_CHANNEL_COUNT {
            channels.set_channel(ch, [10.0 + ch as f32, 20.0 + ch as f32]);
        }
        channels
    }

    #[test]
    fn athena_wasm_decoder_setters_and_defaults() {
        let mut decoder = AthenaWasmDecoder::new();
        assert!(decoder.use_device_timestamps);
        assert_eq!(decoder.reorder_window_ms, DEFAULT_REORDER_WINDOW_MS);
        assert_eq!(decoder.max_buffer_frames, DEFAULT_MAX_BUFFER_FRAMES);
        assert_eq!(decoder.clock_kind, ClockKind::Windowed);

        decoder.set_use_device_timestamps(false);
        decoder.set_reorder_window_ms(0);
        decoder.set_max_buffer_frames(0);
        decoder.set_clock_kind("robust");
        assert!(!decoder.use_device_timestamps);
        assert_eq!(decoder.reorder_window_ms, 0);
        assert_eq!(decoder.max_buffer_frames, 1);
        assert_eq!(decoder.clock_kind, ClockKind::Robust);
        assert!(matches!(decoder.clock_eeg, ClockModel::Robust(_)));

        decoder.set_clock_kind("unknown-value");
        assert_eq!(decoder.clock_kind, ClockKind::Windowed);
        assert!(matches!(decoder.clock_eeg, ClockModel::Windowed(_)));
    }

    #[test]
    fn athena_wasm_decoder_decodes_eeg_packet() {
        let channels = seed_eeg_channels();
        let payload = athena::encode_eeg_packet(7, &channels);

        let mut decoder = AthenaWasmDecoder::new();
        decoder.set_reorder_window_ms(0);
        decoder.set_clock_kind("none");

        let output = decoder.decode(&payload);

        assert_eq!(output.eeg_channel_count, athena::spec::EEG_CHANNEL_COUNT);
        assert_eq!(
            output.eeg_samples.len(),
            athena::spec::EEG_CHANNEL_COUNT * athena::spec::EEG_SAMPLES_PER_CHANNEL
        );
        assert_eq!(
            output.eeg_timestamps_ms.len(),
            athena::spec::EEG_SAMPLES_PER_CHANNEL
        );

        for ch in 0..athena::spec::EEG_CHANNEL_COUNT {
            let expected_0 = 10.0 + ch as f32;
            let expected_1 = 20.0 + ch as f32;
            let got_0 = output.eeg_samples[ch];
            let got_1 = output.eeg_samples[athena::spec::EEG_CHANNEL_COUNT + ch];
            assert!((got_0 - expected_0).abs() < 1.0);
            assert!((got_1 - expected_1).abs() < 1.0);
        }

        assert_eq!(output.accgyro_samples.len(), 0);
        assert_eq!(output.optics_samples.len(), 0);
        assert_eq!(output.battery_samples.len(), 0);
    }

    #[test]
    fn athena_wasm_decoder_handles_fragmented_payload() {
        let channels = seed_eeg_channels();
        let payload = athena::encode_eeg_packet(9, &channels);
        let split = payload.len() / 2;

        let mut decoder = AthenaWasmDecoder::new();
        decoder.set_reorder_window_ms(0);
        decoder.set_clock_kind("none");

        let first = decoder.decode(&payload[..split]);
        assert_eq!(first.eeg_samples.len(), 0);
        assert!(!decoder.raw_buffer.is_empty());

        let second = decoder.decode(&payload[split..]);
        assert_eq!(
            second.eeg_samples.len(),
            athena::spec::EEG_CHANNEL_COUNT * athena::spec::EEG_SAMPLES_PER_CHANNEL
        );
        assert!(decoder.raw_buffer.is_empty());
    }

    #[test]
    fn athena_wasm_decoder_reset_clears_internal_buffers() {
        let channels = seed_eeg_channels();
        let mut payload = athena::encode_eeg_packet(1, &channels);
        payload.extend(athena::encode_eeg_packet(2, &channels));

        let mut decoder = AthenaWasmDecoder::new();
        let output = decoder.decode(&payload);
        assert_eq!(output.eeg_samples.len(), 0);
        assert!(!decoder.buffer_eeg.is_empty());

        decoder.tick_eeg.base_tick = Some(100);
        decoder.raw_buffer.extend_from_slice(&[1, 2, 3]);
        decoder.reset();

        assert!(decoder.raw_buffer.is_empty());
        assert!(decoder.buffer_eeg.is_empty());
        assert!(decoder.buffer_accgyro.is_empty());
        assert!(decoder.buffer_optics.is_empty());
        assert!(decoder.buffer_battery.is_empty());
        assert!(decoder.pending_eeg.is_empty());
        assert!(decoder.pending_accgyro.is_empty());
        assert!(decoder.pending_optics.is_empty());
        assert!(decoder.pending_battery.is_empty());
        assert!(decoder.tick_eeg.base_tick.is_none());
    }
}
