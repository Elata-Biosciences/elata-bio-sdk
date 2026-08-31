#!/usr/bin/env node
/**
 * Generate the device-shaped adapter fixtures in `src/testing/fixtures/`.
 *
 * These stand in for a real capture: the objects an app actually hands the
 * adapters — `HeadbandFrameV1` frames off a BLE transport, rppg-web `Metrics`
 * off a camera pipeline, ppg-web `PpgMetrics` off a contact sensor. The shapes
 * are taken from the peer packages' own type definitions (see the `sourceType`
 * field on each fixture); the numbers are synthesized but physiologically
 * plausible so the adapters are exercised on data that looks like the real
 * thing rather than on hand-built stubs.
 *
 * Deterministic: same seed → same bytes. Regenerate when a peer package
 * changes its metric surface, and expect `adapterDeviceFixtures.test.ts` to
 * tell you when that has happened.
 *
 *   node ./scripts/generate-device-fixtures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, "..");
const outDir = path.join(pkgDir, "src", "testing", "fixtures");
const pkg = JSON.parse(
	fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"),
);
const generator = `${pkg.name}@${pkg.version}`;

/** mulberry32 — small, deterministic, good enough for plausible noise. */
function prng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const round = (value, places) => {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
};

// ---------------------------------------------------------------------------
// Headband frames (@elata-biosciences/eeg-web · HeadbandFrameV1)
// ---------------------------------------------------------------------------

const EEG_CHANNELS = ["TP9", "AF7", "AF8", "TP10"];
const EEG_RATE_HZ = 256;
const EEG_ROWS = 12; // one BLE notification batch
const PPG_CHANNELS = ["PPG_AMBIENT", "PPG_IR", "PPG_RED"];
const OPTICS_CHANNELS = [
	"OPT_740",
	"OPT_850",
	"OPT_940",
	"OPT_REF",
	"OPT_740_B",
	"OPT_850_B",
	"OPT_940_B",
	"OPT_REF_B",
];
const IMU_CHANNELS = ["ACC_X", "ACC_Y", "ACC_Z", "GYRO_X", "GYRO_Y", "GYRO_Z"];

const random = prng(0x5e1a7a);

/** Alpha-dominant EEG in microvolts, with per-channel offset and drift. */
function eegSample(channel, absoluteIndex) {
	const t = absoluteIndex / EEG_RATE_HZ;
	const alpha = 22 * Math.sin(2 * Math.PI * 10.2 * t + channel * 0.8);
	const theta = 9 * Math.sin(2 * Math.PI * 6.1 * t + channel);
	const line = 3.5 * Math.sin(2 * Math.PI * 60 * t);
	const drift = 4 * Math.sin(2 * Math.PI * 0.15 * t + channel * 0.3);
	const noise = (random() - 0.5) * 6;
	return round(alpha + theta + line + drift + noise, 4);
}

function eegBlock(startIndex, deviceTimeMs) {
	return {
		sampleRateHz: EEG_RATE_HZ,
		channelNames: EEG_CHANNELS,
		channelCount: EEG_CHANNELS.length,
		samples: Array.from({ length: EEG_ROWS }, (_, row) =>
			EEG_CHANNELS.map((_name, channel) =>
				eegSample(channel, startIndex + row),
			),
		),
		timestampsMs: Array.from({ length: EEG_ROWS }, (_, row) =>
			round(deviceTimeMs + (row * 1000) / EEG_RATE_HZ, 3),
		),
		clockSource: "device",
	};
}

/** The same signal before the on-device pipeline: DC offset, no notch. */
function eegRawBlock(startIndex, deviceTimeMs) {
	const processed = eegBlock(startIndex, deviceTimeMs);
	return {
		...processed,
		samples: processed.samples.map((row) =>
			row.map((value, channel) =>
				round(value + 812.5 + channel * 17.25 + 14 * Math.sin(channel), 4),
			),
		),
	};
}

function auxBlock(channelNames, rateHz, rows, deviceTimeMs, shape) {
	return {
		sampleRateHz: rateHz,
		channelNames,
		channelCount: channelNames.length,
		samples: Array.from({ length: rows }, (_, row) =>
			channelNames.map((_name, channel) => shape(channel, row)),
		),
		timestampsMs: Array.from({ length: rows }, (_, row) =>
			round(deviceTimeMs + (row * 1000) / rateHz, 3),
		),
		clockSource: "device",
	};
}

const EEG_PROCESSING = {
	applied: true,
	signalKind: "processed",
	rawAvailable: true,
	referenceMode: "common-average",
	detrendMode: "highpass",
	notchFrequenciesHz: [60, 120],
	stageOrder: ["detrend", "notch", "reference"],
};

/**
 * Four frames off a Muse-class transport at ~21 Hz (12 samples @ 256 Hz).
 * Frame 3 skips a sequence id: a BLE reconnect dropped one notification.
 */
const FRAME_SEQUENCES = [1041, 1042, 1044, 1045];

const headbandFrames = FRAME_SEQUENCES.map((sequenceId, index) => {
	// Sample index advances with wall time, so the dropped frame really is a
	// hole in the signal, not just a hole in the numbering.
	const framesElapsed = sequenceId - FRAME_SEQUENCES[0];
	const startIndex = framesElapsed * EEG_ROWS;
	const emittedAtMs = round(
		1_705_312_800_000 + (framesElapsed * (EEG_ROWS * 1000)) / EEG_RATE_HZ,
		3,
	);
	const deviceTimeMs = round(
		48_213.75 + (framesElapsed * (EEG_ROWS * 1000)) / EEG_RATE_HZ,
		3,
	);
	const frame = {
		schemaVersion: "v1",
		source: "muse-athena-ble",
		sequenceId,
		emittedAtMs,
		eeg: eegBlock(startIndex, deviceTimeMs),
		eegRaw: eegRawBlock(startIndex, deviceTimeMs),
		eegProcessing: EEG_PROCESSING,
		ppgRaw: auxBlock(PPG_CHANNELS, 64, 3, deviceTimeMs, (channel, row) =>
			round(
				20_400 +
					channel * 3_100 +
					180 * Math.sin((framesElapsed * 3 + row) / 3.4 + channel) +
					(random() - 0.5) * 40,
				3,
			),
		),
		optics: auxBlock(OPTICS_CHANNELS, 64, 3, deviceTimeMs, (channel, row) =>
			round(
				9_800 +
					channel * 640 +
					95 * Math.sin((framesElapsed * 3 + row) / 4.1 + channel * 0.6) +
					(random() - 0.5) * 25,
				3,
			),
		),
		accgyro: auxBlock(IMU_CHANNELS, 52, 2, deviceTimeMs, (channel, row) =>
			channel < 3
				? round(
						(channel === 2 ? 0.98 : 0.02 * (channel + 1)) +
							0.012 * Math.sin((framesElapsed * 2 + row) / 2.7 + channel) +
							(random() - 0.5) * 0.004,
						5,
					)
				: round(
						0.9 * Math.sin((framesElapsed * 2 + row) / 3.3 + channel) +
							(random() - 0.5) * 0.4,
						5,
					),
		),
	};
	// Battery reports once per second, not once per frame.
	if (index === 0) {
		frame.battery = {
			samples: [96.5],
			timestampsMs: [deviceTimeMs],
			clockSource: "device",
		};
	}
	return frame;
});

// ---------------------------------------------------------------------------
// rPPG metrics (@elata-biosciences/rppg-web · Metrics)
// ---------------------------------------------------------------------------

/**
 * Three emissions from one camera session: warm-up (no BPM yet), a locked
 * steady state carrying the full field surface, and a motion-limited sample
 * where the Bayesian tracker is coasting.
 */
const rppgMetrics = [
	{
		confidence: 0.14,
		signal_quality: 0.38,
		reason_codes: ["insufficient_window", "no_bpm_yet"],
		skin_ratio_mean: 0.52,
		motion_mean: 0.09,
		clip_mean: 0.004,
		bpm: null,
		spectral_bpm: null,
		acf_bpm: null,
		peaks_bpm: null,
		resolved_bpm: null,
		bayes_bpm: null,
		calibrated_bpm: null,
		fused_bpm: null,
		fused_source: "none",
		calibration_trained: false,
		capture_confidence: 0.71,
		capture_motion: 0.83,
		capture_lighting: 0.64,
		capture_limiting: "lighting",
		capture_reasons: ["low_light"],
	},
	{
		// Every field the 0.14 Metrics type can carry, populated.
		bpm: 68.4,
		confidence: 0.88,
		signal_quality: 0.81,
		agreement: 0.93,
		reason_codes: [],
		snr: 6.42,
		skin_ratio_mean: 0.74,
		motion_mean: 0.031,
		clip_mean: 0.0019,
		spectral_bpm: 68.9,
		acf_bpm: 67.8,
		peaks_bpm: 69.2,
		resolved_bpm: 68.5,
		resolved_confidence: 0.86,
		winning_sources: ["spectral", "acf"],
		alias_flag: false,
		bayes_bpm: 68.3,
		bayes_confidence: 0.9,
		bayes_ambiguity: 0.11,
		bayes_tracker_config_id: "bpm-tracker-v1",
		bayes_quality_provider_id: "capture-confidence-v1",
		calibrated_bpm: 68.4,
		fused_bpm: 68.4,
		fused_source: "camera",
		calibration_trained: true,
		baseline_bpm: 63.1,
		baseline_delta: 5.3,
		hrv_rmssd: 41.7,
		respiration_rate: 14.2,
		respiration_confidence: 0.62,
		capture_confidence: 0.91,
		capture_motion: 0.94,
		capture_lighting: 0.88,
		capture_limiting: null,
		capture_reasons: [],
	},
	{
		bpm: 71.2,
		confidence: 0.41,
		signal_quality: 0.44,
		agreement: 0.37,
		reason_codes: ["high_motion", "estimators_disagree"],
		snr: 2.13,
		skin_ratio_mean: 0.61,
		motion_mean: 0.28,
		clip_mean: 0.0071,
		spectral_bpm: 71.9,
		acf_bpm: 143.1,
		peaks_bpm: null,
		resolved_bpm: 71.6,
		resolved_confidence: 0.39,
		winning_sources: ["spectral"],
		alias_flag: true,
		bayes_bpm: 70.8,
		bayes_confidence: 0.55,
		bayes_ambiguity: 0.47,
		bayes_tracker_config_id: "bpm-tracker-v1",
		bayes_quality_provider_id: null,
		calibrated_bpm: 71.1,
		fused_bpm: 71.2,
		fused_source: "blend",
		calibration_trained: true,
		baseline_bpm: 63.4,
		baseline_delta: 7.8,
		hrv_rmssd: null,
		respiration_rate: null,
		respiration_confidence: null,
		capture_confidence: 0.36,
		capture_motion: 0.29,
		capture_lighting: 0.85,
		capture_limiting: "motion",
		capture_reasons: ["high_ti", "motion_blur"],
	},
];

// ---------------------------------------------------------------------------
// Contact PPG metrics (@elata-biosciences/ppg-web · PpgMetrics)
// ---------------------------------------------------------------------------

const ppgMetrics = [
	{
		bpm: null,
		rmssdMs: null,
		sdnnMs: null,
		meanNnMs: null,
		confidence: 0.09,
		signalQuality: 0.22,
		source: "ppgRaw",
		channel: "PPG_IR",
		sampleRateHz: 64,
		windowSampleCount: 192,
		windowDurationMs: 3000,
		lastSampleTimestampMs: 48_216.75,
		emittedAtMs: 1_705_312_803_012,
		spectralBpm: null,
		acfBpm: null,
		peaksBpm: null,
		respirationBpm: null,
		snrDb: null,
		waveformConfidence: null,
		ibiCount: 0,
		reasonCodes: ["insufficient_window"],
	},
	{
		bpm: 66.8,
		rmssdMs: 38.4,
		sdnnMs: 47.9,
		meanNnMs: 898.2,
		confidence: 0.84,
		signalQuality: 0.79,
		source: "ppgRaw",
		channel: "PPG_IR",
		sampleRateHz: 64,
		windowSampleCount: 1024,
		windowDurationMs: 16_000,
		lastSampleTimestampMs: 64_229.5,
		emittedAtMs: 1_705_312_819_026,
		spectralBpm: 67.1,
		acfBpm: 66.4,
		peaksBpm: 66.9,
		respirationBpm: 13.8,
		snrDb: 8.62,
		waveformConfidence: 0.77,
		ibiCount: 17,
		reasonCodes: [],
	},
	{
		bpm: 69.5,
		rmssdMs: null,
		sdnnMs: null,
		meanNnMs: 863.1,
		confidence: 0.48,
		signalQuality: 0.51,
		source: "optics",
		channel: "OPT_940",
		sampleRateHz: 64,
		windowSampleCount: 1024,
		windowDurationMs: 16_000,
		lastSampleTimestampMs: 80_231.25,
		emittedAtMs: 1_705_312_835_038,
		spectralBpm: 69.9,
		acfBpm: 68.7,
		peaksBpm: null,
		respirationBpm: null,
		snrDb: 3.41,
		waveformConfidence: 0.44,
		ibiCount: 4,
		reasonCodes: ["low_signal_quality", "insufficient_ibi"],
	},
];

// ---------------------------------------------------------------------------

function write(name, body) {
	const file = path.join(outDir, name);
	fs.writeFileSync(file, `${JSON.stringify(body, null, "\t")}\n`);
	console.log(`wrote ${path.relative(pkgDir, file)}`);
}

fs.mkdirSync(outDir, { recursive: true });

write("headband-frames-v1.json", {
	fixtureVersion: 1,
	generator,
	sourcePackage: "@elata-biosciences/eeg-web",
	sourceType: "HeadbandFrameV1",
	capture: {
		device: "muse-athena-ble",
		note: "Four consecutive BLE notifications; sequence 1043 was dropped by a reconnect.",
		eegChannels: EEG_CHANNELS,
		eegSampleRateHz: EEG_RATE_HZ,
		rowsPerFrame: EEG_ROWS,
	},
	frames: headbandFrames,
});

write("rppg-metrics-v1.json", {
	fixtureVersion: 1,
	generator,
	sourcePackage: "@elata-biosciences/rppg-web",
	sourceType: "Metrics",
	capture: {
		note: "Three emissions: warm-up, locked steady state (full field surface), motion-limited.",
		fullSurfaceIndex: 1,
	},
	metrics: rppgMetrics,
});

write("ppg-metrics-v1.json", {
	fixtureVersion: 1,
	generator,
	sourcePackage: "@elata-biosciences/ppg-web",
	sourceType: "PpgMetrics",
	capture: {
		note: "Three emissions: warm-up, locked contact PPG, degraded optics fallback.",
		fullSurfaceIndex: 1,
	},
	metrics: ppgMetrics,
});
