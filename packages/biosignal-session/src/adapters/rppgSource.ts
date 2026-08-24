/**
 * rppg-web metrics → `BiosignalSource` producing an "rppg-metrics" stream.
 *
 * The app owns its `RppgSession`/`RppgProcessor`; the adapter only needs a
 * subscription function delivering `Metrics` objects (rppg-web 0.14 shape,
 * whose field names already match the `rppg-metrics@1` Arrow schema).
 * SDK-derived metrics are persisted, never recomputed — with provenance.
 *
 * When an `RppgSessionRecorder` is supplied, every received metrics object
 * is mirrored into it (`recordMetrics`) so the app's replay-format capture
 * stays in sync with the recorded session. Waveform trace capture is not
 * available on this path — waveform windows never reach the metrics
 * callback (they live in the app's `RecordMetricsContext`).
 *
 * Peer imports are type-only; no rppg-web runtime is loaded.
 */

import type { Metrics, RppgSessionRecorder } from "@elata-biosciences/rppg-web";
import {
	RPPG_METRICS_BOOL_FIELDS,
	RPPG_METRICS_DICT_FIELDS,
	RPPG_METRICS_FLOAT_FIELDS,
	RPPG_METRICS_LIST_FIELDS,
} from "../arrow/schemas";
import type { RppgProcessingProvenanceV1 } from "../contracts/provenance";
import type {
	SourceDescriptorDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import type { SessionUs } from "../contracts/time";
import type { BiosignalSource, SourceSink, StreamHandle } from "./types";

export interface RppgSourceOptions {
	/** Subscribe to metrics; returns the unsubscribe function. */
	onMetrics: (
		callback: (metrics: Metrics, timeUs?: SessionUs) => void,
	) => () => void;
	/** Optional replay-format recorder to mirror received metrics into. */
	recorder?: RppgSessionRecorder;
	provenance?: RppgProcessingProvenanceV1;
	/** Source name (default "rppg-camera"). */
	name?: string;
	sdkPackages?: { name: string; version: string }[];
}

const RPPG_ROW_FIELDS: readonly string[] = [
	...RPPG_METRICS_FLOAT_FIELDS,
	...RPPG_METRICS_BOOL_FIELDS,
	...RPPG_METRICS_DICT_FIELDS,
	...RPPG_METRICS_LIST_FIELDS,
];

/** Project a Metrics object onto the `rppg-metrics@1` column set. */
export function rppgMetricsToRow(metrics: Metrics): Record<string, unknown> {
	const source = metrics as unknown as Record<string, unknown>;
	const row: Record<string, unknown> = {};
	for (const field of RPPG_ROW_FIELDS) {
		row[field] = source[field] ?? null;
	}
	return row;
}

export function createRppgSource(options: RppgSourceOptions): BiosignalSource {
	const name = options.name ?? "rppg-camera";
	let sink: SourceSink | null = null;
	let handle: StreamHandle | null = null;
	let unsubscribe: (() => void) | null = null;
	let lastTimeUs: SessionUs = 0;

	const streamDraft = (): StreamDescriptorDraft => ({
		sourceId: name,
		modality: "rppg-metrics",
		sampling: "irregular",
		channels: [],
		encoding: "arrow-ipc",
		arrowSchemaId: "rppg-metrics@1",
		layout: "wide",
		clockSource: "derived",
		processing: options.provenance,
	});

	return {
		descriptor(): SourceDescriptorDraft {
			return {
				kind: "camera",
				name,
				adapter: "rppg-web@1",
				sdkPackages: options.sdkPackages ?? [],
			};
		},

		streams(): StreamDescriptorDraft[] {
			return [streamDraft()];
		},

		async start(nextSink: SourceSink): Promise<void> {
			sink = nextSink;
			handle = nextSink.openStream(streamDraft());
			unsubscribe = options.onMetrics((metrics, timeUs) => {
				const activeSink = sink;
				const activeHandle = handle;
				if (!activeSink || !activeHandle) return;
				const rowTimeUs = timeUs ?? activeSink.clock.nowUs();
				lastTimeUs = Math.max(lastTimeUs, rowTimeUs);
				activeHandle.pushMetricRow(rowTimeUs, rppgMetricsToRow(metrics));
				options.recorder?.recordMetrics(metrics);
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
