import { EegPreprocessor } from "../eegProcessing";
import type { HeadbandFrameV1 } from "../headband";

describe("EegPreprocessor", () => {
	test("disabled processing keeps eeg data raw", () => {
		const processor = new EegPreprocessor({ enabled: false });
		const frame: HeadbandFrameV1 = {
			schemaVersion: "v1",
			source: "test",
			sequenceId: 1,
			emittedAtMs: 1,
			eeg: {
				sampleRateHz: 256,
				channelNames: ["TP9", "AF7"],
				channelCount: 2,
				samples: [[1, 2]],
			},
		};

		const processed = processor.processFrame(frame);
		expect(processed.eeg.samples).toEqual([[1, 2]]);
		expect(processed.eegRaw).toBeUndefined();
		expect(processed.eegProcessing).toMatchObject({
			applied: false,
			signalKind: "raw",
		});
	});

	test("default processing preserves raw eeg and annotates frame", async () => {
		const processor = new EegPreprocessor();
		await processor.ready();
		const frame: HeadbandFrameV1 = {
			schemaVersion: "v1",
			source: "test",
			sequenceId: 1,
			emittedAtMs: 1,
			eeg: {
				sampleRateHz: 256,
				channelNames: ["TP9", "AF7", "AF8", "TP10"],
				channelCount: 4,
				samples: [[1, 2, 3, 4]],
			},
		};

		const processed = processor.processFrame(frame);
		expect(processed.eeg.samples).toEqual([[1, 2, 3, 4]]);
		expect(processed.eegRaw?.samples).toEqual([[1, 2, 3, 4]]);
		expect(processed.eegProcessing).toMatchObject({
			applied: true,
			signalKind: "processed",
			rawAvailable: true,
		});
		processor.dispose();
	});
});
