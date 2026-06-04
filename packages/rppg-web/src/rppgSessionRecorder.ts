import type { Metrics } from "./rppgProcessor";
import type {
	ReplayDebugSession,
	ReplayPairEvent,
	ReplaySyncSample,
} from "./rppgReplay";

/**
 * Captures a live rPPG session into the {@link ReplayDebugSession} format that
 * `replayBayesSession` and the replay benchmark consume — closing the loop:
 * record → download → replay → compare.
 *
 * Feed it the processor's per-frame {@link Metrics} via {@link recordMetrics},
 * and (the part that makes comparisons truth-anchored) push a ground-truth
 * reference BPM via {@link recordReference} — e.g. the Muse headband's contact
 * PPG heart rate — which is stored as a `pairEvent`. A recording with frequent,
 * non-locked reference pairings is what lets the benchmark say which pipeline is
 * actually closer to ground truth, not merely how much they diverge.
 *
 * Waveform windows (the bulk of recording size) are omitted by default; enable
 * {@link RppgRecorderOptions.includeWaveform} only when you need the replay's
 * waveform-periodicity path.
 */
export interface RppgRecorderOptions {
	/** Capture filtered/Muse waveform arrays per sample (large). Default false. */
	includeWaveform?: boolean;
	/** Ring-buffer cap on retained sync samples (oldest dropped). Default 50000. */
	maxSamples?: number;
}

export interface RecordMetricsContext {
	/** Sample timestamp (epoch ms). Defaults to `Date.now()`. */
	timestampMs?: number;
	/** Effective sample rate (Hz) of the waveform window, if known. */
	sampleRate?: number | null;
	/** Free-form stage label (mirrors TradeLock's per-sample stage). */
	stage?: string;
	/** Filtered camera waveform values (stored only when includeWaveform). */
	filteredWindow?: number[] | null;
	/** Muse/reference waveform values (stored only when includeWaveform). */
	museWindow?: number[] | null;
	/** Detected peaks for the window (stored as-is). */
	peaks?: unknown[];
}

function num(value: number | null | undefined): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export class RppgSessionRecorder {
	private readonly options: Required<RppgRecorderOptions>;
	private readonly syncSamples: ReplaySyncSample[] = [];
	private readonly pairEvents: ReplayPairEvent[] = [];
	private lastReferenceBpm: number | null = null;

	constructor(options: RppgRecorderOptions = {}) {
		this.options = {
			includeWaveform: options.includeWaveform ?? false,
			maxSamples: options.maxSamples ?? 50000,
		};
	}

	/** Append one sync sample built from the processor's current metrics. */
	recordMetrics(metrics: Metrics, context: RecordMetricsContext = {}): void {
		const finalBpm = num(metrics.bpm);
		const sample: ReplaySyncSample = {
			epochTs: context.timestampMs ?? Date.now(),
			sampleRate: context.sampleRate ?? null,
			stage: context.stage ?? "recorded",
			estimators: {
				instantBpm: num(metrics.peaks_bpm) ?? finalBpm,
				acfBpm: num(metrics.acf_bpm),
				spectralBpm: num(metrics.spectral_bpm),
				bayesBpm: num(metrics.bayes_bpm),
				bayesConfidence: num(metrics.bayes_confidence),
				finalBpm,
				cameraConfidence: num(metrics.confidence),
				snrDb: num(metrics.snr),
				motion: num(metrics.motion_mean),
				activeReferenceBpm: this.lastReferenceBpm,
				// The replay/benchmark gate on these: suppressed = held this frame,
				// bpmSource carries the evidence trail (no manual lock from the SDK).
				suppressed: finalBpm == null,
				bpmSource:
					metrics.winning_sources && metrics.winning_sources.length
						? metrics.winning_sources.join("|")
						: (metrics.fused_source ?? null),
			},
			outputs: {
				signalQuality:
					metrics.signal_quality != null
						? metrics.signal_quality * 100
						: null,
			},
		};

		if (context.peaks) sample.peaks = context.peaks;
		if (this.options.includeWaveform) {
			if (context.filteredWindow) {
				sample.filteredWindow = { values: context.filteredWindow };
			}
			if (context.museWindow) {
				sample.museWindow = { values: context.museWindow };
			}
		}

		this.syncSamples.push(sample);
		if (this.syncSamples.length > this.options.maxSamples) {
			this.syncSamples.shift();
		}
	}

	/**
	 * Record a ground-truth reference BPM (e.g. Muse contact-PPG heart rate) as a
	 * pair event. Non-finite values are ignored.
	 */
	recordReference(referenceBpm: number, timestampMs?: number): void {
		if (!Number.isFinite(referenceBpm)) return;
		this.lastReferenceBpm = referenceBpm;
		this.pairEvents.push({
			ts: timestampMs ?? Date.now(),
			referenceBpm,
		});
	}

	/** Number of captured sync samples. */
	get sampleCount(): number {
		return this.syncSamples.length;
	}

	/** Number of recorded reference pair events. */
	get pairCount(): number {
		return this.pairEvents.length;
	}

	/** Clear all captured samples and references. */
	reset(): void {
		this.syncSamples.length = 0;
		this.pairEvents.length = 0;
		this.lastReferenceBpm = null;
	}

	/** Snapshot the recording as a replayable session (arrays are copied). */
	toSession(): ReplayDebugSession {
		return {
			syncSamples: this.syncSamples.slice(),
			pairEvents: this.pairEvents.slice(),
		};
	}

	/** Serialize the recording to a JSON string ready to download. */
	toJSON(pretty = false): string {
		return JSON.stringify(this.toSession(), null, pretty ? 2 : 0);
	}
}
