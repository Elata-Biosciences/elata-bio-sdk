/**
 * Adapter contracts: one runtime producer (headset, camera, synthetic)
 * exposes itself as a `BiosignalSource`; the recorder supplies a
 * `SourceSink` at start. Follows the multi-modality plan's subscribe
 * direction while working against today's callback-based SDK surfaces.
 */

import type {
	ClockObservationDraft,
	SessionEventDraft,
	SourceDescriptorDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import type { DiscontinuityV1, SessionUs } from "../contracts/time";

export interface BiosignalSource {
	descriptor(): SourceDescriptorDraft;
	/** Streams declared up front; late arrivals go via `sink.openStream`. */
	streams(): StreamDescriptorDraft[];
	start(sink: SourceSink): Promise<void>;
	stop(): Promise<void>;
}

export interface SourceSink {
	clock: { nowUs(): SessionUs };
	openStream(draft: StreamDescriptorDraft): StreamHandle;
	event(event: SessionEventDraft): void;
	clockObservation(observation: ClockObservationDraft): void;
	status(status: { state: string; errorCode?: string; detail?: string }): void;
}

export interface StreamHandle {
	streamId: string;
	/**
	 * Regular streams: row-major `samples[sampleIdx][channelIdx]` flattened.
	 * `sampleIndex0` is the absolute sample counter of the first row;
	 * `timeUs0` its session time.
	 */
	pushRegular(
		rowMajor: Float32Array,
		rows: number,
		sampleIndex0: number,
		timeUs0: SessionUs,
	): void;
	/** Irregular numeric streams: explicit per-row times. */
	pushIrregular(
		timesUs: Float64Array,
		rowMajor: Float32Array,
		rows: number,
	): void;
	/** Metric-object streams (rppg-metrics / ppg-metrics rows). */
	pushMetricRow(timeUs: SessionUs, row: Record<string, unknown>): void;
	/**
	 * Optional: attribute the next detected timeline discontinuity (e.g.
	 * a transport `sequenceId` gap → `"ble-reconnect"`). Additive and
	 * optional so existing implementations stay valid.
	 */
	hintDiscontinuity?(reason: NonNullable<DiscontinuityV1["reason"]>): void;
	close(endUs: SessionUs): void;
}
