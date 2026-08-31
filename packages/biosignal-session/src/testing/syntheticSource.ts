/**
 * Deterministic seeded synthetic biosignal source.
 *
 * Ground-truth structure (all seeded via mulberry32 — the same seed and
 * config produce byte-identical output):
 * - EEG (default 4ch @ 256 Hz): 10 Hz alpha whose amplitude is gated by
 *   30 s eyes-open/eyes-closed epochs, plus pink noise (Paul Kellet
 *   approximation), 60 Hz mains, and a per-channel DC offset.
 * - `rppg-metrics` rows at 1 Hz carrying the full rppg-web 0.14 field set,
 *   with heart rate ramping 60 → 80 bpm.
 * - `ppg-metrics` rows at 0.5 Hz with the full ppg-web 0.12 field set.
 * - Epoch marker events at every epoch boundary.
 * - Device-clock observations every 10 s with configurable drift (ppm) and
 *   utc-check observations every 60 s.
 * - Optional dropouts: batches whose start falls inside a dropout window are
 *   never produced, so downstream gap detection sees a real time jump while
 *   the pushed sample counter stays contiguous (mirrors real sources).
 *
 * The source is pumped manually (`pump(durationMs)`) so tests control
 * virtual time exactly; pair it with `fakeClock` for fast-clock endurance.
 */

import type {
	BiosignalSource,
	SourceSink,
	StreamHandle,
} from "../adapters/types";
import type {
	SourceDescriptorDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import { CLOCK_OBSERVATION_INTERVALS } from "../contracts/time";
import type { SessionUs } from "../contracts/time";
import { mulberry32 } from "./prng";

export interface SyntheticDropout {
	atUs: SessionUs;
	durationUs: number;
}

export interface SyntheticEegConfig {
	channelCount?: number;
	sampleRateHz?: number;
	epochSec?: number;
	alphaHz?: number;
	mainsHz?: number;
	alphaOpenAmp?: number;
	alphaClosedAmp?: number;
	pinkAmp?: number;
	mainsAmp?: number;
	/** "simple" skips pink noise — cheap waveform for endurance runs. */
	waveform?: "full" | "simple";
}

export interface SyntheticSourceConfig {
	seed?: number;
	eeg?: SyntheticEegConfig | false;
	rppgMetrics?: { rateHz?: number } | false;
	ppgMetrics?: { rateHz?: number } | false;
	/** Device-clock drift in parts per million (default +40). */
	driftPpm?: number;
	dropouts?: SyntheticDropout[];
	/** Virtual push cadence (default 250 ms). */
	batchMs?: number;
	/** Seconds over which heart rate ramps 60 → 80 bpm (default 120). */
	hrRampSec?: number;
}

export interface SyntheticEpoch {
	index: number;
	condition: "eyes-open" | "eyes-closed";
	startUs: SessionUs;
	endUs: SessionUs;
}

export interface SyntheticBiosignalSource extends BiosignalSource {
	/** Generate and push `durationMs` of virtual time. Requires `start()`. */
	pump(durationMs: number): void;
	/** Virtual µs generated so far. */
	virtualTimeUs(): SessionUs;
	/** Ground-truth epoch table covering `[0, endUs)`. */
	epochsThrough(endUs: SessionUs): SyntheticEpoch[];
	/** EEG samples pushed so far (excludes dropout losses). */
	pushedEegSamples(): number;
}

export function epochCondition(index: number): "eyes-open" | "eyes-closed" {
	return index % 2 === 0 ? "eyes-open" : "eyes-closed";
}

export function createSyntheticSource(
	config: SyntheticSourceConfig = {},
): SyntheticBiosignalSource {
	const seed = config.seed ?? 42;
	const eegConfig = config.eeg === false ? null : (config.eeg ?? {});
	const eeg = eegConfig
		? {
				channelCount: eegConfig.channelCount ?? 4,
				sampleRateHz: eegConfig.sampleRateHz ?? 256,
				epochSec: eegConfig.epochSec ?? 30,
				alphaHz: eegConfig.alphaHz ?? 10,
				mainsHz: eegConfig.mainsHz ?? 60,
				alphaOpenAmp: eegConfig.alphaOpenAmp ?? 2,
				alphaClosedAmp: eegConfig.alphaClosedAmp ?? 20,
				pinkAmp: eegConfig.pinkAmp ?? 5,
				mainsAmp: eegConfig.mainsAmp ?? 2,
				waveform: eegConfig.waveform ?? "full",
			}
		: null;
	const rppgRateHz =
		config.rppgMetrics === false ? null : (config.rppgMetrics?.rateHz ?? 1);
	const ppgRateHz =
		config.ppgMetrics === false ? null : (config.ppgMetrics?.rateHz ?? 0.5);
	const driftPpm = config.driftPpm ?? 40;
	const dropouts = config.dropouts ?? [];
	const batchMs = config.batchMs ?? 250;
	const hrRampSec = config.hrRampSec ?? 120;

	const random = mulberry32(seed);
	// Paul Kellet pink-noise filter state, one per channel.
	const pinkState: number[][] = [];

	let sink: SourceSink | null = null;
	let eegHandle: StreamHandle | null = null;
	let rppgHandle: StreamHandle | null = null;
	let ppgHandle: StreamHandle | null = null;

	let virtualUs = 0;
	let pushedEegSamples = 0;
	let nextEegSampleIndex = 0; // absolute ground-truth sample counter
	let nextRppgRowUs = 0;
	let nextPpgRowUs = 0;
	let nextEpochBoundaryUs = 0;
	let nextDeviceClockUs = 0;
	let nextUtcCheckUs = 0;
	let deviceSequenceId = 0;
	const deviceBaseMs = 1_000_000; // arbitrary synthetic device epoch

	const inDropout = (timeUs: SessionUs): boolean =>
		dropouts.some(
			(dropout) =>
				timeUs >= dropout.atUs && timeUs < dropout.atUs + dropout.durationUs,
		);

	const pinkSample = (channel: number): number => {
		let state = pinkState[channel];
		if (!state) {
			state = [0, 0, 0];
			pinkState[channel] = state;
		}
		const white = random() * 2 - 1;
		state[0] = 0.99765 * state[0] + white * 0.099046;
		state[1] = 0.963 * state[1] + white * 0.2965164;
		state[2] = 0.57 * state[2] + white * 1.0526913;
		return state[0] + state[1] + state[2] + white * 0.1848;
	};

	const eegValue = (channel: number, sampleIndex: number): number => {
		if (!eeg) return 0;
		const t = sampleIndex / eeg.sampleRateHz;
		const epochIndex = Math.floor(t / eeg.epochSec);
		const alphaAmp =
			epochCondition(epochIndex) === "eyes-closed"
				? eeg.alphaClosedAmp
				: eeg.alphaOpenAmp;
		const phase = (channel * Math.PI) / 4;
		let value =
			alphaAmp * Math.sin(2 * Math.PI * eeg.alphaHz * t + phase) +
			eeg.mainsAmp * Math.sin(2 * Math.PI * eeg.mainsHz * t) +
			(channel + 1) * 1.5;
		if (eeg.waveform === "full") value += eeg.pinkAmp * pinkSample(channel);
		return value;
	};

	const heartRateAt = (timeUs: SessionUs): number => {
		const t = timeUs / 1_000_000;
		return 60 + 20 * Math.min(1, t / hrRampSec);
	};

	const rppgRow = (timeUs: SessionUs): Record<string, unknown> => {
		const bpm = heartRateAt(timeUs);
		const jitter = () => (random() - 0.5) * 1.5;
		return {
			bpm,
			confidence: 0.9,
			signal_quality: 0.85,
			agreement: 0.8,
			snr: 3.5,
			skin_ratio_mean: 0.72,
			motion_mean: 0.08,
			clip_mean: 0.02,
			spectral_bpm: bpm + jitter(),
			acf_bpm: bpm + jitter(),
			peaks_bpm: bpm + jitter(),
			resolved_bpm: bpm,
			resolved_confidence: 0.88,
			bayes_bpm: bpm,
			bayes_confidence: 0.9,
			bayes_ambiguity: 0.1,
			calibrated_bpm: bpm,
			fused_bpm: bpm,
			baseline_bpm: 60,
			baseline_delta: bpm - 60,
			hrv_rmssd: 42,
			respiration_rate: 14,
			respiration_confidence: 0.6,
			capture_confidence: 0.92,
			capture_motion: 0.95,
			capture_lighting: 0.9,
			alias_flag: false,
			calibration_trained: true,
			fused_source: "camera",
			capture_limiting: null,
			bayes_tracker_config_id: "default",
			bayes_quality_provider_id: "capture",
			reason_codes: [],
			winning_sources: ["spectral", "acf"],
			capture_reasons: [],
		};
	};

	const ppgRow = (timeUs: SessionUs): Record<string, unknown> => {
		const bpm = heartRateAt(timeUs);
		return {
			bpm,
			rmssd_ms: 45,
			sdnn_ms: 52,
			mean_nn_ms: 60_000 / bpm,
			confidence: 0.85,
			signal_quality: 0.8,
			spectral_bpm: bpm,
			acf_bpm: bpm,
			peaks_bpm: bpm,
			respiration_bpm: 14,
			snr_db: 6.5,
			waveform_confidence: 0.8,
			window_duration_ms: 16_000,
			sample_rate_hz: 64,
			ibi_count: 12,
			window_sample_count: 1024,
			last_sample_timestamp_ms: timeUs / 1000,
			emitted_at_ms: timeUs / 1000,
			source: "ppgRaw",
			channel: "PPG1",
			reason_codes: [],
		};
	};

	const streamDrafts = (): StreamDescriptorDraft[] => {
		const drafts: StreamDescriptorDraft[] = [];
		if (eeg) {
			drafts.push({
				sourceId: "synthetic",
				modality: "eeg",
				sampling: "regular",
				sampleRateHz: eeg.sampleRateHz,
				channels: Array.from({ length: eeg.channelCount }, (_, index) => ({
					name: `EEG${index + 1}`,
					unit: "uV",
				})),
				encoding: "arrow-ipc",
				arrowSchemaId: "regular-wide-f32@1",
				layout: "wide",
				clockSource: "local",
			});
		}
		if (rppgRateHz !== null) {
			drafts.push({
				sourceId: "synthetic",
				modality: "rppg-metrics",
				sampling: "irregular",
				channels: [],
				encoding: "arrow-ipc",
				arrowSchemaId: "rppg-metrics@1",
				layout: "wide",
				clockSource: "derived",
			});
		}
		if (ppgRateHz !== null) {
			drafts.push({
				sourceId: "synthetic",
				modality: "ppg-metrics",
				sampling: "irregular",
				channels: [],
				encoding: "arrow-ipc",
				arrowSchemaId: "ppg-metrics@1",
				layout: "wide",
				clockSource: "derived",
			});
		}
		return drafts;
	};

	const pumpStep = (stepStartUs: SessionUs, stepUs: number): void => {
		const activeSink = sink;
		if (!activeSink) return;
		const stepEndUs = stepStartUs + stepUs;

		// Epoch boundary events (ground truth markers).
		if (eeg) {
			const epochUs = eeg.epochSec * 1_000_000;
			while (nextEpochBoundaryUs < stepEndUs) {
				const index = Math.round(nextEpochBoundaryUs / epochUs);
				activeSink.event({
					timestampUs: nextEpochBoundaryUs,
					kind: "marker",
					name: `epoch.${epochCondition(index)}`,
					payload: { index },
				});
				nextEpochBoundaryUs += epochUs;
			}
		}

		// EEG batch for [stepStartUs, stepEndUs).
		if (eeg && eegHandle) {
			const rate = eeg.sampleRateHz;
			const firstIndex = nextEegSampleIndex;
			const lastIndexExclusive = Math.floor((stepEndUs * rate) / 1_000_000);
			const rows = lastIndexExclusive - firstIndex;
			nextEegSampleIndex = lastIndexExclusive;
			if (rows > 0) {
				if (inDropout(stepStartUs)) {
					// Lost at the source — samples never materialize.
				} else {
					const data = new Float32Array(rows * eeg.channelCount);
					for (let row = 0; row < rows; row++) {
						for (let channel = 0; channel < eeg.channelCount; channel++) {
							data[row * eeg.channelCount + channel] = eegValue(
								channel,
								firstIndex + row,
							);
						}
					}
					const timeUs0 = Math.round((firstIndex * 1_000_000) / rate);
					eegHandle.pushRegular(data, rows, pushedEegSamples, timeUs0);
					pushedEegSamples += rows;
				}
			}
		}

		// Metric rows.
		if (rppgRateHz !== null && rppgHandle) {
			const periodUs = Math.round(1_000_000 / rppgRateHz);
			while (nextRppgRowUs < stepEndUs) {
				rppgHandle.pushMetricRow(nextRppgRowUs, rppgRow(nextRppgRowUs));
				nextRppgRowUs += periodUs;
			}
		}
		if (ppgRateHz !== null && ppgHandle) {
			const periodUs = Math.round(1_000_000 / ppgRateHz);
			while (nextPpgRowUs < stepEndUs) {
				ppgHandle.pushMetricRow(nextPpgRowUs, ppgRow(nextPpgRowUs));
				nextPpgRowUs += periodUs;
			}
		}

		// Clock observations.
		while (nextDeviceClockUs < stepEndUs) {
			deviceSequenceId += 1;
			activeSink.clockObservation({
				sourceId: "synthetic",
				kind: "device-clock",
				observedAtUs: nextDeviceClockUs,
				deviceTimestampMs:
					deviceBaseMs + (nextDeviceClockUs / 1000) * (1 + driftPpm * 1e-6),
				sequenceId: deviceSequenceId,
			});
			nextDeviceClockUs += CLOCK_OBSERVATION_INTERVALS.deviceClockMs * 1000;
		}
		while (nextUtcCheckUs < stepEndUs) {
			activeSink.clockObservation({
				sourceId: "synthetic",
				kind: "utc-check",
				observedAtUs: nextUtcCheckUs,
				utcMs: 1_700_000_000_000 + nextUtcCheckUs / 1000,
			});
			nextUtcCheckUs += CLOCK_OBSERVATION_INTERVALS.utcCheckMs * 1000;
		}
	};

	return {
		descriptor(): SourceDescriptorDraft {
			return {
				kind: "synthetic",
				name: "synthetic",
				adapter: "synthetic@1",
				device: eeg
					? {
							samplingRateHz: eeg.sampleRateHz,
							eegChannelNames: Array.from(
								{ length: eeg.channelCount },
								(_, index) => `EEG${index + 1}`,
							),
						}
					: undefined,
				sdkPackages: [
					{ name: "@elata-biosciences/biosignal-session", version: "0.1.0" },
				],
			};
		},

		streams(): StreamDescriptorDraft[] {
			return streamDrafts();
		},

		async start(nextSink: SourceSink): Promise<void> {
			sink = nextSink;
			const drafts = streamDrafts();
			for (const draft of drafts) {
				const handle = nextSink.openStream(draft);
				if (draft.modality === "eeg") eegHandle = handle;
				else if (draft.modality === "rppg-metrics") rppgHandle = handle;
				else if (draft.modality === "ppg-metrics") ppgHandle = handle;
			}
			nextSink.status({ state: "streaming" });
		},

		async stop(): Promise<void> {
			const endUs = virtualUs;
			eegHandle?.close(endUs);
			rppgHandle?.close(endUs);
			ppgHandle?.close(endUs);
			sink?.status({ state: "stopped" });
			sink = null;
		},

		pump(durationMs: number): void {
			if (!sink) throw new Error("synthetic source not started");
			const stepUs = batchMs * 1000;
			const targetUs = virtualUs + Math.round(durationMs * 1000);
			while (virtualUs + stepUs <= targetUs) {
				pumpStep(virtualUs, stepUs);
				virtualUs += stepUs;
			}
		},

		virtualTimeUs(): SessionUs {
			return virtualUs;
		},

		epochsThrough(endUs: SessionUs): SyntheticEpoch[] {
			if (!eeg) return [];
			const epochUs = eeg.epochSec * 1_000_000;
			const epochs: SyntheticEpoch[] = [];
			for (let startUs = 0; startUs < endUs; startUs += epochUs) {
				const index = Math.round(startUs / epochUs);
				epochs.push({
					index,
					condition: epochCondition(index),
					startUs,
					endUs: Math.min(endUs, startUs + epochUs),
				});
			}
			return epochs;
		},

		pushedEegSamples(): number {
			return pushedEegSamples;
		},
	};
}
