import type { PpgMetrics } from "@elata-biosciences/ppg-web";
import { createPpgSource, ppgMetricsToRow } from "../adapters/ppgSource";
import type { SourceSink, StreamHandle } from "../adapters/types";
import {
	PPG_METRICS_DICT_FIELDS,
	PPG_METRICS_F64_FIELDS,
	PPG_METRICS_FLOAT_FIELDS,
	PPG_METRICS_INT_FIELDS,
	PPG_METRICS_LIST_FIELDS,
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
				streamId: "ppg-1",
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

/** Structural fixture — a full ppg-web 0.12 PpgMetrics object, no runtime. */
const fullMetrics: PpgMetrics = {
	bpm: 64,
	rmssdMs: 44.5,
	sdnnMs: 51.2,
	meanNnMs: 937.5,
	confidence: 0.82,
	signalQuality: 0.77,
	source: "ppgRaw",
	channel: "PPG1",
	sampleRateHz: 64,
	windowSampleCount: 1024,
	windowDurationMs: 16_000,
	lastSampleTimestampMs: 123_456,
	emittedAtMs: 123_500,
	spectralBpm: 64.2,
	acfBpm: 63.8,
	peaksBpm: 64.1,
	respirationBpm: 13.5,
	snrDb: 7.1,
	waveformConfidence: 0.75,
	ibiCount: 14,
	reasonCodes: ["insufficient_ibi"],
};

describe("metrics → row mapping", () => {
	it("maps every camelCase field onto the ppg-metrics@1 snake_case columns", () => {
		const row = ppgMetricsToRow(fullMetrics);
		const expectedKeys = [
			...PPG_METRICS_FLOAT_FIELDS,
			...PPG_METRICS_INT_FIELDS,
			...PPG_METRICS_F64_FIELDS,
			...PPG_METRICS_DICT_FIELDS,
			...PPG_METRICS_LIST_FIELDS,
		].sort();
		expect(Object.keys(row).sort()).toEqual(expectedKeys);
		expect(row.rmssd_ms).toBe(44.5);
		expect(row.sdnn_ms).toBe(51.2);
		expect(row.mean_nn_ms).toBe(937.5);
		expect(row.snr_db).toBe(7.1);
		expect(row.window_sample_count).toBe(1024);
		expect(row.last_sample_timestamp_ms).toBe(123_456);
		expect(row.source).toBe("ppgRaw");
		expect(row.reason_codes).toEqual(["insufficient_ibi"]);
	});

	it("passes through nulls for absent estimates", () => {
		const row = ppgMetricsToRow({ ...fullMetrics, bpm: null, rmssdMs: null });
		expect(row.bpm).toBeNull();
		expect(row.rmssd_ms).toBeNull();
	});
});

describe("source behavior", () => {
	it("opens a ppg-metrics stream, timestamps rows from the sink clock, and cleans up", async () => {
		const captured = captureSink();
		let callback: ((m: PpgMetrics) => void) | null = null;
		const unsubscribe = jest.fn();
		const source = createPpgSource({
			onMetrics: (cb) => {
				callback = cb;
				return unsubscribe;
			},
		});
		expect(source.descriptor()).toMatchObject({
			kind: "wearable",
			adapter: "ppg-web@1",
		});
		expect(source.streams()[0]).toMatchObject({
			modality: "ppg-metrics",
			arrowSchemaId: "ppg-metrics@1",
		});

		await source.start(captured.sink);
		expect(captured.opened).toHaveLength(1);
		captured.nowUs.value = 2_000_000;
		callback?.(fullMetrics);
		expect(captured.rows).toHaveLength(1);
		expect(captured.rows[0].timeUs).toBe(2_000_000);
		expect(captured.rows[0].row.bpm).toBe(64);

		captured.nowUs.value = 4_000_000;
		await source.stop();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(captured.closed).toEqual([4_000_000]);
		// After stop the callback is inert.
		callback?.(fullMetrics);
		expect(captured.rows).toHaveLength(1);
	});
});
