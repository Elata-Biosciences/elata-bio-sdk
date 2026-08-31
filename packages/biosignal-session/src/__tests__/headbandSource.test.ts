import type {
	HeadbandFrameV1,
	HeadbandSignalBlock,
	HeadbandTransport,
	HeadbandTransportStatus,
} from "@elata-biosciences/eeg-web";
import { createHeadbandSource } from "../adapters/headbandSource";
import type { SourceSink, StreamHandle } from "../adapters/types";
import type {
	ClockObservationDraft,
	SessionEventDraft,
	StreamDescriptorDraft,
} from "../contracts/session";

interface Captured {
	sink: SourceSink;
	nowUs: { value: number };
	opened: StreamDescriptorDraft[];
	pushes: {
		modality: string;
		data: Float32Array;
		rows: number;
		sampleIndex0: number;
		timeUs0: number;
	}[];
	irregular: { modality: string; timesUs: Float64Array; data: Float32Array }[];
	hints: { modality: string; reason: string }[];
	events: SessionEventDraft[];
	observations: ClockObservationDraft[];
	statuses: { state: string; errorCode?: string; detail?: string }[];
	closed: string[];
}

function captureSink(): Captured {
	const nowUs = { value: 0 };
	const captured: Captured = {
		nowUs,
		opened: [],
		pushes: [],
		irregular: [],
		hints: [],
		events: [],
		observations: [],
		statuses: [],
		closed: [],
		sink: {
			clock: { nowUs: () => nowUs.value },
			openStream(draft): StreamHandle {
				captured.opened.push(draft);
				return {
					streamId: `${draft.modality}-id`,
					pushRegular(rowMajor, rows, sampleIndex0, timeUs0) {
						captured.pushes.push({
							modality: draft.modality,
							data: rowMajor.slice(),
							rows,
							sampleIndex0,
							timeUs0,
						});
					},
					pushIrregular(timesUs, rowMajor) {
						captured.irregular.push({
							modality: draft.modality,
							timesUs: timesUs.slice(),
							data: rowMajor.slice(),
						});
					},
					pushMetricRow() {},
					hintDiscontinuity(reason) {
						captured.hints.push({ modality: draft.modality, reason });
					},
					close() {
						captured.closed.push(draft.modality);
					},
				};
			},
			event(event) {
				captured.events.push(event);
			},
			clockObservation(observation) {
				captured.observations.push(observation);
			},
			status(status) {
				captured.statuses.push(status);
			},
		},
	};
	return captured;
}

/** Minimal structural transport — no peer runtime involved. */
function fakeTransport(): HeadbandTransport {
	return {
		onFrame: undefined,
		onStatus: undefined,
		connect: async () => {},
		disconnect: async () => {},
		start: async () => {},
		stop: async () => {},
	};
}

const eegBlock = (rows: number, channels = 4, rate = 256): HeadbandSignalBlock => ({
	sampleRateHz: rate,
	channelNames: Array.from({ length: channels }, (_, index) => `EEG${index + 1}`),
	channelCount: channels,
	// samples[sampleIdx][channelIdx] per the remote-corrected contract.
	samples: Array.from({ length: rows }, (_, row) =>
		Array.from({ length: channels }, (_, channel) => row * 10 + channel),
	),
});

const frame = (
	sequenceId: number,
	overrides: Partial<HeadbandFrameV1> = {},
): HeadbandFrameV1 => ({
	schemaVersion: "v1",
	source: "muse-ble",
	sequenceId,
	emittedAtMs: sequenceId * 250,
	eeg: eegBlock(12),
	...overrides,
});

const processingDetails = {
	applied: true,
	signalKind: "processed" as const,
	rawAvailable: true,
	referenceMode: "common-average" as const,
	detrendMode: "highpass" as const,
	notchFrequenciesHz: [60],
	stageOrder: ["notch", "detrend", "rereference"],
};

describe("EEG block mapping", () => {
	it("opens an eeg stream with rate, channels, and processing provenance", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(frame(1, { eegProcessing: processingDetails }));

		expect(captured.opened).toHaveLength(1);
		expect(captured.opened[0]).toMatchObject({
			modality: "eeg",
			sampling: "regular",
			sampleRateHz: 256,
			arrowSchemaId: "regular-wide-f32@1",
			processing: {
				kind: "eeg-processing",
				applied: true,
				signalKind: "processed",
				referenceMode: "common-average",
				stageOrder: ["notch", "detrend", "rereference"],
			},
		});
		expect(captured.opened[0].channels.map((c) => c.name)).toEqual([
			"EEG1",
			"EEG2",
			"EEG3",
			"EEG4",
		]);
	});

	it("transposes samples[sampleIdx][channelIdx] into row-major data", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(frame(1, { eeg: eegBlock(2, 2) }));
		const push = captured.pushes[0];
		expect(push.rows).toBe(2);
		expect(Array.from(push.data)).toEqual([0, 1, 10, 11]);
	});

	it("keeps a contiguous per-stream sample counter and aligns times to arrival", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		captured.nowUs.value = 1_000_000;
		transport.onFrame?.(frame(1));
		captured.nowUs.value = 1_250_000;
		transport.onFrame?.(frame(2));
		const [first, second] = captured.pushes;
		expect(first.sampleIndex0).toBe(0);
		expect(second.sampleIndex0).toBe(12);
		// Last of 12 samples at 256 Hz lands on the arrival instant.
		expect(first.timeUs0).toBe(1_000_000 - Math.round((11 * 1_000_000) / 256));
		expect(second.timeUs0).toBe(1_250_000 - Math.round((11 * 1_000_000) / 256));
	});

	it("maps raw-signal frames to the eeg-raw modality", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(
			frame(1, {
				eegProcessing: { ...processingDetails, applied: false, signalKind: "raw" },
			}),
		);
		expect(captured.opened[0].modality).toBe("eeg-raw");
	});

	it("records frame.eegRaw as a second eeg-raw stream with raw provenance", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(
			frame(1, { eegProcessing: processingDetails, eegRaw: eegBlock(12) }),
		);
		expect(captured.opened.map((draft) => draft.modality)).toEqual([
			"eeg",
			"eeg-raw",
		]);
		expect(captured.opened[1].processing).toMatchObject({
			kind: "eeg-processing",
			applied: false,
			signalKind: "raw",
		});
	});

	it("omits eegRaw when includeRaw is false", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport, { includeRaw: false });
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(frame(1, { eegRaw: eegBlock(12) }));
		expect(captured.opened.map((draft) => draft.modality)).toEqual(["eeg"]);
	});
});

describe("aux block mapping", () => {
	it("maps ppgRaw, optics, and accgyro onto ppg/optics/imu streams", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(
			frame(1, {
				ppgRaw: eegBlock(4, 3, 64),
				optics: eegBlock(4, 8, 64),
				accgyro: eegBlock(2, 6, 52),
			}),
		);
		expect(captured.opened.map((draft) => draft.modality)).toEqual([
			"eeg",
			"ppg",
			"optics",
			"imu",
		]);
		expect(captured.opened[3].sampleRateHz).toBe(52);
	});

	it("maps battery onto an irregular battery stream", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		captured.nowUs.value = 5_000_000;
		transport.onFrame?.(
			frame(1, { battery: { samples: [97.5], clockSource: "device" } }),
		);
		const batteryDraft = captured.opened.find(
			(draft) => draft.modality === "battery",
		);
		expect(batteryDraft).toMatchObject({
			sampling: "irregular",
			arrowSchemaId: "battery@1",
			channels: [{ name: "battery_pct", unit: "%" }],
		});
		expect(captured.irregular).toHaveLength(1);
		expect(Array.from(captured.irregular[0].data)).toEqual([97.5]);
		expect(Array.from(captured.irregular[0].timesUs)).toEqual([5_000_000]);
	});
});

describe("sequence gaps and reconnects", () => {
	it("hints ble-reconnect and emits a device-status event on a sequenceId gap", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(frame(1));
		transport.onFrame?.(frame(5)); // gap: 2..4 lost
		expect(captured.hints).toEqual([{ modality: "eeg", reason: "ble-reconnect" }]);
		expect(captured.events).toHaveLength(1);
		expect(captured.events[0]).toMatchObject({
			kind: "device-status",
			name: "ble.sequence-gap",
			payload: { expected: 2, actual: 5 },
		});
	});

	it("hints ble-reconnect after a reconnecting status", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(frame(1));
		transport.onStatus?.({
			state: "reconnecting",
			atMs: 0,
		} as unknown as HeadbandTransportStatus);
		transport.onFrame?.(frame(2)); // contiguous sequence, but reconnected
		expect(captured.hints).toEqual([{ modality: "eeg", reason: "ble-reconnect" }]);
	});

	it("forwards transport statuses to the sink", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onStatus?.({
			state: "degraded",
			atMs: 1,
			errorCode: "BLE_START_FAILED",
			reason: "weak signal",
		} as unknown as HeadbandTransportStatus);
		expect(captured.statuses).toEqual([
			{ state: "degraded", errorCode: "BLE_START_FAILED", detail: "weak signal" },
		]);
	});
});

describe("device clock observations", () => {
	it("captures device timestamps on first frame then every 10 s", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		const deviceBlock = (last: number): HeadbandSignalBlock => ({
			...eegBlock(12),
			clockSource: "device",
			timestampsMs: [last - 1, last],
		});
		captured.nowUs.value = 0;
		transport.onFrame?.(frame(1, { eeg: deviceBlock(1000) }));
		captured.nowUs.value = 5_000_000; // 5 s — below cadence
		transport.onFrame?.(frame(2, { eeg: deviceBlock(6000) }));
		captured.nowUs.value = 10_000_000; // 10 s — due again
		transport.onFrame?.(frame(3, { eeg: deviceBlock(11_000) }));
		expect(captured.observations).toHaveLength(2);
		expect(captured.observations[0]).toMatchObject({
			kind: "device-clock",
			observedAtUs: 0,
			deviceTimestampMs: 1000,
			sequenceId: 1,
		});
		expect(captured.observations[1]).toMatchObject({
			observedAtUs: 10_000_000,
			deviceTimestampMs: 11_000,
			sequenceId: 3,
		});
	});

	it("emits no observations for local-clock blocks", async () => {
		const transport = fakeTransport();
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(frame(1));
		expect(captured.observations).toHaveLength(0);
	});
});

describe("lifecycle", () => {
	it("declares a wearable descriptor and no up-front streams", () => {
		const source = createHeadbandSource(fakeTransport(), { name: "muse-s" });
		expect(source.descriptor()).toMatchObject({
			kind: "wearable",
			name: "muse-s",
			adapter: "headband-transport@1",
		});
		expect(source.streams()).toEqual([]);
	});

	it("stop restores previous handlers and closes opened streams", async () => {
		const transport = fakeTransport();
		const framesSeen: number[] = [];
		const previous = (f: HeadbandFrameV1) => framesSeen.push(f.sequenceId);
		transport.onFrame = previous;
		const source = createHeadbandSource(transport);
		const captured = captureSink();
		await source.start(captured.sink);
		transport.onFrame?.(frame(1));
		// The previous handler still runs (chained).
		expect(framesSeen).toEqual([1]);
		await source.stop();
		expect(transport.onFrame).toBe(previous);
		expect(captured.closed).toEqual(["eeg"]);
	});
});
