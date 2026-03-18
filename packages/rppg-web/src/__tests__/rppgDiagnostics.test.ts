import { computeTraceWaveformDebug } from "../rppgDiagnostics";

describe("computeTraceWaveformDebug", () => {
	test("derives public waveform debug data from a trace snapshot", () => {
		const waveform = computeTraceWaveformDebug(
			{
				sampleRate: 10,
				windowSec: 5,
				totalSamplesReceived: 6,
				windowSampleCount: 6,
				windowDurationMs: 500,
				durationSec: 0.5,
				points: [
					{ timestampMs: 0, intensity: 0.1, r: 0, g: 0, b: 0, skinRatio: 0, motion: 0, clipRatio: 0 },
					{ timestampMs: 100, intensity: 0.6, r: 0, g: 0, b: 0, skinRatio: 0, motion: 0, clipRatio: 0 },
					{ timestampMs: 200, intensity: 0.2, r: 0, g: 0, b: 0, skinRatio: 0, motion: 0, clipRatio: 0 },
					{ timestampMs: 300, intensity: 0.8, r: 0, g: 0, b: 0, skinRatio: 0, motion: 0, clipRatio: 0 },
					{ timestampMs: 400, intensity: 0.3, r: 0, g: 0, b: 0, skinRatio: 0, motion: 0, clipRatio: 0 },
					{ timestampMs: 500, intensity: 0.2, r: 0, g: 0, b: 0, skinRatio: 0, motion: 0, clipRatio: 0 },
				],
				lastSample: null,
				backendFailure: null,
			},
			{ minPeakDistanceSec: 0.1 },
		);

		expect(waveform.sampleCount).toBe(6);
		expect(waveform.durationSec).toBe(0.5);
		expect(waveform.points).toHaveLength(6);
		expect(waveform.peaks.map((peak) => peak.time)).toEqual([100, 300]);
		expect(waveform.threshold).not.toBeNull();
	});
});
