import type { SourceSink, StreamHandle } from "../adapters/types";
import type {
	ClockObservationDraft,
	SessionEventDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import {
	RPPG_METRICS_BOOL_FIELDS,
	RPPG_METRICS_DICT_FIELDS,
	RPPG_METRICS_FLOAT_FIELDS,
	RPPG_METRICS_LIST_FIELDS,
	PPG_METRICS_DICT_FIELDS,
	PPG_METRICS_F64_FIELDS,
	PPG_METRICS_FLOAT_FIELDS,
	PPG_METRICS_INT_FIELDS,
	PPG_METRICS_LIST_FIELDS,
} from "../arrow/schemas";
import { createSyntheticSource, epochCondition } from "../testing/syntheticSource";
import type { SyntheticSourceConfig } from "../testing/syntheticSource";

interface CapturedPush {
	streamModality: string;
	rows: number;
	sampleIndex0: number;
	timeUs0: number;
	data: Float32Array;
}

interface CapturedMetricRow {
	streamModality: string;
	timeUs: number;
	row: Record<string, unknown>;
}

function captureSink() {
	const pushes: CapturedPush[] = [];
	const metricRows: CapturedMetricRow[] = [];
	const events: SessionEventDraft[] = [];
	const observations: ClockObservationDraft[] = [];
	const opened: StreamDescriptorDraft[] = [];
	const closed: string[] = [];
	const sink: SourceSink = {
		clock: { nowUs: () => 0 },
		openStream(draft) {
			opened.push(draft);
			const handle: StreamHandle = {
				streamId: draft.modality,
				pushRegular(rowMajor, rows, sampleIndex0, timeUs0) {
					pushes.push({
						streamModality: draft.modality,
						rows,
						sampleIndex0,
						timeUs0,
						data: rowMajor.slice(),
					});
				},
				pushIrregular() {},
				pushMetricRow(timeUs, row) {
					metricRows.push({ streamModality: draft.modality, timeUs, row });
				},
				close() {
					closed.push(draft.modality);
				},
			};
			return handle;
		},
		event(event) {
			events.push(event);
		},
		clockObservation(observation) {
			observations.push(observation);
		},
		status() {},
	};
	return { sink, pushes, metricRows, events, observations, opened, closed };
}

async function run(config: SyntheticSourceConfig, pumpMs: number) {
	const source = createSyntheticSource(config);
	const captured = captureSink();
	await source.start(captured.sink);
	source.pump(pumpMs);
	return { source, ...captured };
}

describe("determinism", () => {
	it("same seed and config produce byte-identical output", async () => {
		const a = await run({ seed: 7 }, 5_000);
		const b = await run({ seed: 7 }, 5_000);
		expect(a.pushes.length).toBeGreaterThan(0);
		expect(a.pushes.length).toBe(b.pushes.length);
		for (let i = 0; i < a.pushes.length; i++) {
			expect(Buffer.from(a.pushes[i].data.buffer)).toEqual(
				Buffer.from(b.pushes[i].data.buffer),
			);
			expect(a.pushes[i].timeUs0).toBe(b.pushes[i].timeUs0);
		}
		expect(a.metricRows).toEqual(b.metricRows);
	});

	it("a different seed produces different bytes", async () => {
		const a = await run({ seed: 7 }, 1_000);
		const b = await run({ seed: 8 }, 1_000);
		expect(Buffer.from(a.pushes[0].data.buffer)).not.toEqual(
			Buffer.from(b.pushes[0].data.buffer),
		);
	});
});

describe("stream declaration", () => {
	it("declares eeg, rppg-metrics, and ppg-metrics streams and opens them on start", async () => {
		const { source, opened } = await run({}, 0);
		expect(source.streams().map((draft) => draft.modality)).toEqual([
			"eeg",
			"rppg-metrics",
			"ppg-metrics",
		]);
		expect(opened.map((draft) => draft.modality)).toEqual([
			"eeg",
			"rppg-metrics",
			"ppg-metrics",
		]);
		const eegDraft = opened[0];
		expect(eegDraft.sampleRateHz).toBe(256);
		expect(eegDraft.channels).toHaveLength(4);
		expect(eegDraft.arrowSchemaId).toBe("regular-wide-f32@1");
	});

	it("stop closes every opened stream", async () => {
		const { source, closed } = await run({}, 1_000);
		await source.stop();
		expect(closed).toEqual(["eeg", "rppg-metrics", "ppg-metrics"]);
	});
});

describe("EEG ground truth", () => {
	it("pushes 256 Hz batches with contiguous counters and nominal times", async () => {
		const { pushes, source } = await run({ seed: 1 }, 2_000);
		const eegPushes = pushes.filter((push) => push.streamModality === "eeg");
		expect(eegPushes).toHaveLength(8); // 2 s / 250 ms
		expect(eegPushes.map((push) => push.rows)).toEqual([
			64, 64, 64, 64, 64, 64, 64, 64,
		]);
		expect(eegPushes[0].sampleIndex0).toBe(0);
		expect(eegPushes[1].sampleIndex0).toBe(64);
		expect(eegPushes[1].timeUs0).toBe(250_000);
		expect(source.pushedEegSamples()).toBe(512);
	});

	it("gates alpha amplitude by 30 s eyes-open/eyes-closed epochs", async () => {
		const { pushes } = await run(
			{ seed: 1, eeg: { waveform: "simple" }, rppgMetrics: false, ppgMetrics: false },
			61_000,
		);
		const amplitude = (fromUs: number, toUs: number): number => {
			let min = Number.POSITIVE_INFINITY;
			let max = Number.NEGATIVE_INFINITY;
			for (const push of pushes) {
				if (push.timeUs0 < fromUs || push.timeUs0 >= toUs) continue;
				for (let row = 0; row < push.rows; row++) {
					const value = push.data[row * 4]; // channel 0
					min = Math.min(min, value);
					max = Math.max(max, value);
				}
			}
			return max - min;
		};
		const openAmp = amplitude(0, 30_000_000);
		const closedAmp = amplitude(30_000_000, 60_000_000);
		// Eyes-closed alpha (20) dominates eyes-open (2 + mains 2).
		expect(closedAmp).toBeGreaterThan(openAmp * 3);
	});

	it("emits epoch marker events at every boundary with the right condition", async () => {
		const { events, source } = await run({ seed: 1 }, 91_000);
		const markers = events.filter((event) => event.kind === "marker");
		expect(markers.map((event) => event.name)).toEqual([
			"epoch.eyes-open",
			"epoch.eyes-closed",
			"epoch.eyes-open",
			"epoch.eyes-closed",
		]);
		expect(markers.map((event) => event.timestampUs)).toEqual([
			0, 30_000_000, 60_000_000, 90_000_000,
		]);
		const epochs = source.epochsThrough(90_000_000);
		expect(epochs).toHaveLength(3);
		expect(epochs.map((epoch) => epoch.condition)).toEqual([
			"eyes-open",
			"eyes-closed",
			"eyes-open",
		]);
		expect(epochCondition(0)).toBe("eyes-open");
		expect(epochCondition(1)).toBe("eyes-closed");
	});
});

describe("metric rows", () => {
	it("produces 1 Hz rppg rows with the full 0.14 field set and an HR ramp", async () => {
		const { metricRows } = await run({ seed: 1 }, 10_000);
		const rppg = metricRows.filter((row) => row.streamModality === "rppg-metrics");
		expect(rppg).toHaveLength(10);
		expect(rppg.map((row) => row.timeUs)).toEqual(
			Array.from({ length: 10 }, (_, index) => index * 1_000_000),
		);
		const expectedKeys = [
			...RPPG_METRICS_FLOAT_FIELDS,
			...RPPG_METRICS_BOOL_FIELDS,
			...RPPG_METRICS_DICT_FIELDS,
			...RPPG_METRICS_LIST_FIELDS,
		].sort();
		expect(Object.keys(rppg[0].row).sort()).toEqual(expectedKeys);
		// Ramp 60 → 80 over 120 s: at 9 s the rate has risen but not peaked.
		expect(rppg[0].row.bpm).toBe(60);
		expect(rppg[9].row.bpm).toBeCloseTo(60 + 20 * (9 / 120));
	});

	it("produces 0.5 Hz ppg rows with the full ppg-web field set", async () => {
		const { metricRows } = await run({ seed: 1 }, 10_000);
		const ppg = metricRows.filter((row) => row.streamModality === "ppg-metrics");
		expect(ppg).toHaveLength(5);
		expect(ppg.map((row) => row.timeUs)).toEqual([
			0, 2_000_000, 4_000_000, 6_000_000, 8_000_000,
		]);
		const expectedKeys = [
			...PPG_METRICS_FLOAT_FIELDS,
			...PPG_METRICS_INT_FIELDS,
			...PPG_METRICS_F64_FIELDS,
			...PPG_METRICS_DICT_FIELDS,
			...PPG_METRICS_LIST_FIELDS,
		].sort();
		expect(Object.keys(ppg[0].row).sort()).toEqual(expectedKeys);
	});
});

describe("clock observations and drift", () => {
	it("emits device-clock every 10 s and utc-check every 60 s", async () => {
		const { observations } = await run({ seed: 1 }, 121_000);
		const device = observations.filter((obs) => obs.kind === "device-clock");
		const utc = observations.filter((obs) => obs.kind === "utc-check");
		expect(device.map((obs) => obs.observedAtUs)).toEqual(
			Array.from({ length: 13 }, (_, index) => index * 10_000_000),
		);
		expect(utc.map((obs) => obs.observedAtUs)).toEqual([
			0, 60_000_000, 120_000_000,
		]);
		expect(device.every((obs) => typeof obs.sequenceId === "number")).toBe(true);
	});

	it("device timestamps carry the configured drift, recoverable by regression", async () => {
		const driftPpm = 40;
		const { observations } = await run({ seed: 1, driftPpm }, 121_000);
		const device = observations.filter((obs) => obs.kind === "device-clock");
		const first = device[0];
		const last = device[device.length - 1];
		const deviceDeltaMs =
			(last.deviceTimestampMs ?? 0) - (first.deviceTimestampMs ?? 0);
		const sessionDeltaMs = (last.observedAtUs - first.observedAtUs) / 1000;
		const recoveredPpm = (deviceDeltaMs / sessionDeltaMs - 1) * 1e6;
		expect(recoveredPpm).toBeCloseTo(driftPpm, 3);
	});
});

describe("dropouts", () => {
	it("skips batches inside a dropout window, leaving a time jump", async () => {
		const { pushes, source } = await run(
			{
				seed: 1,
				dropouts: [{ atUs: 2_000_000, durationUs: 1_000_000 }],
				rppgMetrics: false,
				ppgMetrics: false,
			},
			5_000,
		);
		const eegPushes = pushes.filter((push) => push.streamModality === "eeg");
		// 20 batches nominal minus 4 dropped (1 s at 250 ms cadence).
		expect(eegPushes).toHaveLength(16);
		expect(source.pushedEegSamples()).toBe(16 * 64);
		// The pushed counter stays contiguous while time jumps by 1 s.
		const beforeGap = eegPushes[7];
		const afterGap = eegPushes[8];
		expect(afterGap.sampleIndex0).toBe(beforeGap.sampleIndex0 + 64);
		expect(afterGap.timeUs0 - beforeGap.timeUs0).toBe(1_250_000);
	});
});
