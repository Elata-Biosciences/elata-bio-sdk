/** analyzeEeg over the mocked wasm glue: API shape, observation policies. */

import { analyzeEeg, deterministicObservationId } from "../eeg/analyzeEeg.js";
import { AnalyticsError } from "../errors.js";
import { syntheticEegInterleaved } from "../testing/synthetic.js";

function inputOfSeconds(durationS: number) {
	const { samples, sampleRateHz, channels } = syntheticEegInterleaved({
		durationS,
		channelCount: 2,
		seed: 11,
	});
	return { samples, sampleRateHz, channels, sessionId: "s-1", streamId: "stream-1" };
}

describe("analyzeEeg", () => {
	test("rejects unavailable profiles and invalid input", async () => {
		const input = inputOfSeconds(40);
		await expect(analyzeEeg({ ...input, profile: "deep" })).rejects.toMatchObject({
			code: "profile_unavailable",
		});
		await expect(analyzeEeg({ ...input, channels: [] })).rejects.toMatchObject({
			code: "invalid_input",
		});
		await expect(
			analyzeEeg({ ...input, samples: input.samples.subarray(0, 33) }),
		).rejects.toMatchObject({ code: "invalid_input" });
	});

	test("windows a 40 s session into 30 s / 5 s sliding windows", async () => {
		const result = await analyzeEeg(inputOfSeconds(40));
		// frames 10240, window 7680, step 1280 -> starts 0..2560 -> 3 windows
		expect(result.perWindow).toHaveLength(3);
		expect(result.perWindow[0].windowStartUs).toBe(0);
		expect(result.perWindow[1].windowStartUs).toBe(5_000_000);
		expect(result.perWindow[0].windowEndUs).toBe(30_000_000);
		expect(result.provenance.algorithm).toBe("eeg_window_features@1");
		expect(result.provenance.configId).toBe("mock-config-id");
		expect(result.provenance.inputStreamIds).toEqual(["stream-1"]);
	});

	test("emits per-channel + channel-mean band-power observations", async () => {
		const result = await analyzeEeg(inputOfSeconds(40));
		const alphaRel = result.observations.filter(
			(obs) => obs.metricId === "eeg.band_power.alpha.relative" && obs.windowStartUs === 0,
		);
		// 2 per-channel rows + 1 channel-mean row.
		expect(alphaRel).toHaveLength(3);
		// `sort()` always places undefined last, so the channel-mean row trails.
		expect(alphaRel.map((obs) => obs.channel).sort()).toEqual(["ch0", "ch1", undefined]);
		const channelMean = alphaRel.find((obs) => obs.channel === undefined);
		expect(channelMean?.value).toBeCloseTo(0.2, 9);
		expect(channelMean?.unit).toBe("ratio");
	});

	test("alpha-peak observations average qualified channels only", async () => {
		const result = await analyzeEeg(inputOfSeconds(40));
		const alphaPeaks = result.observations.filter(
			(obs) => obs.metricId === "eeg.alpha_peak_frequency",
		);
		expect(alphaPeaks.length).toBe(3);
		// Mock qualifies ch0 only at 10.25 Hz.
		expect(alphaPeaks[0].value).toBeCloseTo(10.25, 9);
	});

	test("summary carries summary_stats@1 over channel-mean series", async () => {
		const result = await analyzeEeg(inputOfSeconds(40));
		const alphaSummary = result.summary["eeg.band_power.alpha.relative"];
		expect(alphaSummary?.count).toBe(3);
		expect(alphaSummary?.mean).toBeCloseTo(0.2, 9);
		expect(result.summary["eeg.spectral_entropy"]?.count).toBe(3);
	});

	test("withholds with insufficient_window under 10 s of samples", async () => {
		const result = await analyzeEeg(inputOfSeconds(4));
		expect(result.perWindow).toHaveLength(0);
		expect(result.observations.length).toBeGreaterThan(0);
		for (const obs of result.observations) {
			expect(obs.value).toBeNull();
			expect(obs.exclusionReason).toBe("insufficient_window");
			expect(obs.coverage).toBe(0);
		}
	});

	test("aborts between windows via AbortSignal", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			analyzeEeg({ ...inputOfSeconds(40), signal: controller.signal }),
		).rejects.toMatchObject({ code: "aborted" });
	});

	test("observation ids are deterministic (idempotent recompute)", async () => {
		const first = await analyzeEeg(inputOfSeconds(40));
		const second = await analyzeEeg(inputOfSeconds(40));
		expect(first.observations.map((obs) => obs.observationId)).toEqual(
			second.observations.map((obs) => obs.observationId),
		);
		const ids = new Set(first.observations.map((obs) => obs.observationId));
		expect(ids.size).toBe(first.observations.length);
	});

	test("deterministicObservationId separates channel and window identity", () => {
		const base = deterministicObservationId("s", "m", "1.0.0", 0);
		expect(deterministicObservationId("s", "m", "1.0.0", 0)).toBe(base);
		expect(deterministicObservationId("s", "m", "1.0.0", 1)).not.toBe(base);
		expect(deterministicObservationId("s", "m", "1.0.0", 0, "ch0")).not.toBe(base);
		expect(deterministicObservationId("s2", "m", "1.0.0", 0)).not.toBe(base);
	});

	test("errors carry AnalyticsError instances", async () => {
		expect.assertions(1);
		try {
			await analyzeEeg({ ...inputOfSeconds(40), sampleRateHz: -1 });
		} catch (error) {
			expect(error).toBeInstanceOf(AnalyticsError);
		}
	});
});
