import type { HeadbandFrameV1 } from "@elata-biosciences/eeg-web";
import { PpgProcessor } from "../ppgProcessor";

function buildWave(
	sampleCount: number,
	sampleRateHz: number,
	bpm: number,
	phase = 0,
	noise = 0,
): number[] {
	return Array.from({ length: sampleCount }, (_, index) => {
		const t = index / sampleRateHz;
		const base = Math.sin(2 * Math.PI * (bpm / 60) * t + phase);
		const harmonic = 0.25 * Math.sin(2 * Math.PI * (bpm / 30) * t + phase * 0.5);
		const respiration = 0.08 * Math.sin(2 * Math.PI * 0.22 * t);
		const drift = 0.02 * Math.sin(2 * Math.PI * 0.04 * t);
		const pseudoNoise = noise * Math.sin(2 * Math.PI * 5.2 * t + 0.7);
		return 900 + base * 80 + harmonic * 25 + respiration * 18 + drift * 10 + pseudoNoise;
	});
}

function makeFrame(
	rows: number[][],
	emittedAtMs: number,
	source: "ppgRaw" | "optics" = "ppgRaw",
	timestampsMs?: number[],
): HeadbandFrameV1 {
	return {
		schemaVersion: "v1",
		source: "test",
		sequenceId: Math.floor(emittedAtMs),
		emittedAtMs,
		eeg: {
			sampleRateHz: 256,
			channelNames: ["TP9", "AF7", "AF8", "TP10"],
			channelCount: 4,
			samples: [[0, 0, 0, 0]],
		},
		[source]: {
			sampleRateHz: 64,
			channelNames:
				source === "ppgRaw"
					? ["PPG1", "PPG2", "PPG3"]
					: ["OPTICS1", "OPTICS2", "OPTICS3"],
			channelCount: 3,
			samples: rows,
			timestampsMs,
			clockSource: timestampsMs ? "device" : "local",
		},
	};
}

function feedFrames(
	processor: PpgProcessor,
	rows: number[][],
	source: "ppgRaw" | "optics" = "ppgRaw",
	withTimestamps = false,
) {
	const chunkSize = 8;
	const sampleRateHz = 64;
	for (let offset = 0; offset < rows.length; offset += chunkSize) {
		const chunk = rows.slice(offset, offset + chunkSize);
		const firstIndex = offset;
		const timestampsMs = withTimestamps
			? chunk.map(
					(_, index) => (firstIndex + index) * (1000 / sampleRateHz),
				)
			: undefined;
		const emittedAtMs = (offset + chunk.length) * (1000 / sampleRateHz);
		processor.pushFrame(makeFrame(chunk, emittedAtMs, source, timestampsMs));
	}
}

describe("PpgProcessor", () => {
	test("auto-selects the strongest Muse ppgRaw channel and produces HRV metrics", () => {
		const processor = new PpgProcessor({ windowSec: 16 });
		const sampleRateHz = 64;
		const sampleCount = sampleRateHz * 18;
		const ppg1 = buildWave(sampleCount, sampleRateHz, 72, 0, 22);
		const ppg2 = buildWave(sampleCount, sampleRateHz, 72, 0.15, 5);
		const ppg3 = buildWave(sampleCount, sampleRateHz, 72, 0.5, 18);
		const rows = Array.from({ length: sampleCount }, (_, index) => [
			ppg1[index],
			ppg2[index],
			ppg3[index],
		]);

		feedFrames(processor, rows);

		const metrics = processor.getMetrics();
		const debug = processor.getDebugSnapshot();
		const trace = processor.getTraceSnapshot();

		expect(metrics.source).toBe("ppgRaw");
		expect(metrics.channel).toBe("PPG2");
		expect(metrics.bpm).toBeGreaterThan(60);
		expect(metrics.bpm).toBeLessThan(84);
		expect(metrics.rmssdMs).not.toBeNull();
		expect(metrics.sdnnMs).not.toBeNull();
		expect(metrics.signalQuality).toBeGreaterThan(0.35);
		expect(debug.candidates).toHaveLength(3);
		expect(trace.points.length).toBeGreaterThan(50);
	});

	test("respects an explicit optics channel selection", () => {
		const processor = new PpgProcessor({
			windowSec: 16,
			source: "optics",
			channel: "OPTICS3",
		});
		const sampleRateHz = 64;
		const sampleCount = sampleRateHz * 18;
		const optics1 = buildWave(sampleCount, sampleRateHz, 68, 0.2, 14);
		const optics2 = buildWave(sampleCount, sampleRateHz, 68, 0.6, 16);
		const optics3 = buildWave(sampleCount, sampleRateHz, 68, 0.1, 4);
		const rows = Array.from({ length: sampleCount }, (_, index) => [
			optics1[index],
			optics2[index],
			optics3[index],
		]);

		feedFrames(processor, rows, "optics", true);

		const metrics = processor.getMetrics();

		expect(metrics.source).toBe("optics");
		expect(metrics.channel).toBe("OPTICS3");
		expect(metrics.bpm).toBeGreaterThan(58);
		expect(metrics.bpm).toBeLessThan(80);
		expect(metrics.reasonCodes).not.toContain("insufficient_window");
	});

	test("reports insufficient window until enough data exists", () => {
		const processor = new PpgProcessor({ windowSec: 16 });
		feedFrames(
			processor,
			Array.from({ length: 12 }, () => [900, 910, 920]),
		);

		const metrics = processor.getMetrics();

		expect(metrics.bpm).toBeNull();
		expect(metrics.reasonCodes).toContain("insufficient_window");
	});
});
