/**
 * ppg-web metrics → `BiosignalSource` producing a "ppg-metrics" stream.
 *
 * The app owns its `PpgSession`/`PpgProcessor`; the adapter subscribes to
 * `PpgMetrics` objects (ppg-web 0.12 shape) and maps their camelCase fields
 * onto the snake_case `ppg-metrics@1` Arrow columns. Derived values are
 * persisted, never recomputed.
 *
 * Peer imports are type-only; no ppg-web runtime is loaded.
 */

import type { PpgMetrics } from "@elata-biosciences/ppg-web";
import type {
	SourceDescriptorDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import type { SessionUs } from "../contracts/time";
import type { BiosignalSource, SourceSink, StreamHandle } from "./types";

export interface PpgSourceOptions {
	/** Subscribe to metrics; returns the unsubscribe function. */
	onMetrics: (callback: (metrics: PpgMetrics) => void) => () => void;
	/** Source name (default "ppg-contact"). */
	name?: string;
	sdkPackages?: { name: string; version: string }[];
}

/** Map a `PpgMetrics` object onto the `ppg-metrics@1` column set. */
export function ppgMetricsToRow(metrics: PpgMetrics): Record<string, unknown> {
	return {
		bpm: metrics.bpm,
		rmssd_ms: metrics.rmssdMs,
		sdnn_ms: metrics.sdnnMs,
		mean_nn_ms: metrics.meanNnMs,
		confidence: metrics.confidence,
		signal_quality: metrics.signalQuality,
		spectral_bpm: metrics.spectralBpm,
		acf_bpm: metrics.acfBpm,
		peaks_bpm: metrics.peaksBpm,
		respiration_bpm: metrics.respirationBpm,
		snr_db: metrics.snrDb,
		waveform_confidence: metrics.waveformConfidence,
		window_duration_ms: metrics.windowDurationMs,
		sample_rate_hz: metrics.sampleRateHz,
		ibi_count: metrics.ibiCount,
		window_sample_count: metrics.windowSampleCount,
		last_sample_timestamp_ms: metrics.lastSampleTimestampMs,
		emitted_at_ms: metrics.emittedAtMs,
		source: metrics.source,
		channel: metrics.channel,
		reason_codes: metrics.reasonCodes,
	};
}

export function createPpgSource(options: PpgSourceOptions): BiosignalSource {
	const name = options.name ?? "ppg-contact";
	let sink: SourceSink | null = null;
	let handle: StreamHandle | null = null;
	let unsubscribe: (() => void) | null = null;
	let lastTimeUs: SessionUs = 0;

	const streamDraft = (): StreamDescriptorDraft => ({
		sourceId: name,
		modality: "ppg-metrics",
		sampling: "irregular",
		channels: [],
		encoding: "arrow-ipc",
		arrowSchemaId: "ppg-metrics@1",
		layout: "wide",
		clockSource: "derived",
	});

	return {
		descriptor(): SourceDescriptorDraft {
			return {
				kind: "wearable",
				name,
				adapter: "ppg-web@1",
				sdkPackages: options.sdkPackages ?? [],
			};
		},

		streams(): StreamDescriptorDraft[] {
			return [streamDraft()];
		},

		async start(nextSink: SourceSink): Promise<void> {
			sink = nextSink;
			handle = nextSink.openStream(streamDraft());
			unsubscribe = options.onMetrics((metrics) => {
				const activeSink = sink;
				const activeHandle = handle;
				if (!activeSink || !activeHandle) return;
				const timeUs = activeSink.clock.nowUs();
				lastTimeUs = Math.max(lastTimeUs, timeUs);
				activeHandle.pushMetricRow(timeUs, ppgMetricsToRow(metrics));
			});
			nextSink.status({ state: "streaming" });
		},

		async stop(): Promise<void> {
			unsubscribe?.();
			unsubscribe = null;
			const endUs = sink
				? Math.max(lastTimeUs, sink.clock.nowUs())
				: lastTimeUs;
			handle?.close(endUs);
			handle = null;
			sink = null;
		},
	};
}
