/**
 * TS wrapper unit tests over the mocked wasm glue (jest moduleNameMapper).
 * Real-WASM parity lives in eegWindowFeatures.parity.test.ts.
 */

import { bandRatio, EegWindowFeatureExtractor } from "../eeg/eegWindowFeatures.js";
import { AnalyticsError } from "../errors.js";
import { initAnalyticsWasm, isAnalyticsWasmInitStarted } from "../runtime.js";

describe("initAnalyticsWasm singleton", () => {
	test("initializes once and reuses the same promise", async () => {
		const first = initAnalyticsWasm();
		const second = initAnalyticsWasm("ignored-second-input");
		expect(isAnalyticsWasmInitStarted()).toBe(true);
		await expect(first).resolves.toBeDefined();
		expect(await first).toBe(await second);
	});
});

describe("EegWindowFeatureExtractor (mock glue)", () => {
	test("create validates inputs", async () => {
		await expect(
			EegWindowFeatureExtractor.create({ sampleRateHz: 0, channelCount: 2 }),
		).rejects.toMatchObject({ code: "invalid_input" });
		await expect(
			EegWindowFeatureExtractor.create({ sampleRateHz: 256, channelCount: 0 }),
		).rejects.toMatchObject({ code: "invalid_input" });
	});

	test("extract parses and guards the wasm JSON", async () => {
		const extractor = await EegWindowFeatureExtractor.create({
			sampleRateHz: 256,
			channelCount: 2,
		});
		const features = extractor.extract(new Float32Array(1024));
		expect(features.schema).toBe("elata.eeg-window-features/v1");
		expect(features.channelCount).toBe(2);
		expect(features.sampleCount).toBe(512);
		expect(features.configId).toBe(extractor.configId);
		expect(features.alphaPeakHz[0]).toBe(10.25);
		expect(features.alphaPeakHz[1]).toBeNull();
		extractor.dispose();
	});

	test("updateLayout changes the analyzed shape", async () => {
		const extractor = await EegWindowFeatureExtractor.create({
			sampleRateHz: 256,
			channelCount: 2,
		});
		extractor.updateLayout(128, 1);
		const features = extractor.extract(new Float32Array(100));
		expect(features.channelCount).toBe(1);
		expect(features.sampleCount).toBe(100);
		extractor.dispose();
	});

	test("dispose is idempotent and blocks further use", async () => {
		const extractor = await EegWindowFeatureExtractor.create({
			sampleRateHz: 256,
			channelCount: 1,
		});
		extractor.dispose();
		extractor.dispose();
		expect(() => extractor.extract(new Float32Array(8))).toThrow(AnalyticsError);
	});
});

describe("bandRatio (band_ratio@1)", () => {
	test("computes simple ratios", () => {
		expect(bandRatio(0.4, 0.2)).toBeCloseTo(2, 12);
	});

	test("degenerate denominators and non-finite inputs yield null", () => {
		expect(bandRatio(0.4, 0)).toBeNull();
		expect(bandRatio(0.4, -1)).toBeNull();
		expect(bandRatio(Number.NaN, 0.2)).toBeNull();
		expect(bandRatio(0.4, Number.NaN)).toBeNull();
	});
});
