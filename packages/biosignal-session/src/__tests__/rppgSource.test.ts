import type { Metrics } from "@elata-biosciences/rppg-web";
import { createRppgSource, rppgMetricsToRow } from "../adapters/rppgSource";
import type { SourceSink, StreamHandle } from "../adapters/types";
import {
	RPPG_METRICS_BOOL_FIELDS,
	RPPG_METRICS_DICT_FIELDS,
	RPPG_METRICS_FLOAT_FIELDS,
	RPPG_METRICS_LIST_FIELDS,
} from "../arrow/schemas";
import type { StreamDescriptorDraft } from "../contracts/session";

function captureSink() {
	const nowUs = { value: 0 };
	const opened: StreamDescriptorDraft[] = [];
	const rows: { timeUs: number; row: Record<string, unknown> }[] = [];
	const closed: number[] = [];
	const sink: SourceSink = {
		clock: { nowUs: () => nowUs.value },
		openStream(draft): StreamHandle {
			opened.push(draft);
			return {
				streamId: "rppg-1",
				pushRegular() {},
				pushIrregular() {},
				pushMetricRow(timeUs, row) {
					rows.push({ timeUs, row });
				},
				close(endUs) {
					closed.push(endUs);
				},
			};
		},
		event() {},
		clockObservation() {},
		status() {},
	};
	return { sink, nowUs, opened, rows, closed };
}

/** Structural fixture — a full rppg-web 0.14 Metrics object, no runtime. */
const fullMetrics: Metrics = {
	bpm: 72,
	confidence: 0.91,
	signal_quality: 0.86,
	agreement: 0.8,
	reason_codes: ["ok"],
	snr: 4.2,
	skin_ratio_mean: 0.7,
	motion_mean: 0.05,
	clip_mean: 0.01,
	spectral_bpm: 72.5,
	acf_bpm: 71.8,
	peaks_bpm: 72.1,
	resolved_bpm: 72.2,
	resolved_confidence: 0.9,
	winning_sources: ["spectral", "acf"],
	alias_flag: false,
	bayes_bpm: 72.3,
	bayes_confidence: 0.92,
	bayes_ambiguity: 0.08,
	bayes_tracker_config_id: "default",
	bayes_quality_provider_id: "capture",
	calibrated_bpm: 72.4,
	fused_bpm: 72.4,
	fused_source: "camera",
	calibration_trained: true,
	baseline_bpm: 65,
	baseline_delta: 7.4,
	hrv_rmssd: 38,
	respiration_rate: 15,
	respiration_confidence: 0.55,
	capture_confidence: 0.93,
	capture_motion: 0.96,
	capture_lighting: 0.9,
	capture_limiting: null,
	capture_reasons: [],
};

describe("metrics → row projection", () => {
	it("projects every rppg-metrics@1 column from a full Metrics object", () => {
		const row = rppgMetricsToRow(fullMetrics);
		const expectedKeys = [
			...RPPG_METRICS_FLOAT_FIELDS,
			...RPPG_METRICS_BOOL_FIELDS,
			...RPPG_METRICS_DICT_FIELDS,
			...RPPG_METRICS_LIST_FIELDS,
		].sort();
		expect(Object.keys(row).sort()).toEqual(expectedKeys);
		expect(row.bpm).toBe(72);
		expect(row.capture_limiting).toBeNull();
		expect(row.winning_sources).toEqual(["spectral", "acf"]);
	});

	it("nullifies absent optional fields", () => {
		const sparse: Metrics = { confidence: 0.4, signal_quality: 0.3 };
		const row = rppgMetricsToRow(sparse);
		expect(row.confidence).toBe(0.4);
		expect(row.bpm).toBeNull();
		expect(row.bayes_tracker_config_id).toBeNull();
		expect(row.reason_codes).toBeNull();
	});
});

describe("source behavior", () => {
	it("opens an rppg-metrics stream with provenance and pushes rows on callback", async () => {
		const captured = captureSink();
		let callback: ((m: Metrics, timeUs?: number) => void) | null = null;
		const unsubscribe = jest.fn();
		const source = createRppgSource({
			onMetrics: (cb) => {
				callback = cb;
				return unsubscribe;
			},
			provenance: {
				kind: "rppg-processing",
				packageVersion: "0.14.0",
				trackerConfigId: "default",
			},
		});
		expect(source.descriptor()).toMatchObject({
			kind: "camera",
			adapter: "rppg-web@1",
		});
		expect(source.streams()).toHaveLength(1);

		await source.start(captured.sink);
		expect(captured.opened[0]).toMatchObject({
			modality: "rppg-metrics",
			sampling: "irregular",
			arrowSchemaId: "rppg-metrics@1",
			processing: { kind: "rppg-processing", packageVersion: "0.14.0" },
		});

		captured.nowUs.value = 3_000_000;
		callback?.(fullMetrics);
		expect(captured.rows).toHaveLength(1);
		expect(captured.rows[0].timeUs).toBe(3_000_000);
		expect(captured.rows[0].row.bpm).toBe(72);

		// An explicit timeUs wins over the sink clock.
		callback?.(fullMetrics, 4_500_000);
		expect(captured.rows[1].timeUs).toBe(4_500_000);

		await source.stop();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(captured.closed).toEqual([4_500_000]);
	});

	it("mirrors received metrics into a provided recorder", async () => {
		const captured = captureSink();
		const recordMetrics = jest.fn();
		let callback: ((m: Metrics) => void) | null = null;
		const source = createRppgSource({
			onMetrics: (cb) => {
				callback = cb;
				return () => {};
			},
			recorder: { recordMetrics } as never,
		});
		await source.start(captured.sink);
		callback?.(fullMetrics);
		expect(recordMetrics).toHaveBeenCalledWith(fullMetrics);
	});
});
