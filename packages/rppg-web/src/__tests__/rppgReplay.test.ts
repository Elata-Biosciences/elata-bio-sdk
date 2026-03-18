import { replayBayesSession } from "../rppgReplay";

function makeWaveformValues(bpm: number, fs = 30, count = 180) {
	const hz = bpm / 60;
	return new Array(count).fill(0).map((_, i) => {
		const t = i / fs;
		return (
			Math.sin(2 * Math.PI * hz * t) +
			0.2 * Math.sin(2 * Math.PI * hz * 2 * t) +
			0.04 * Math.sin(2 * Math.PI * 0.12 * t)
		);
	});
}

describe("replayBayesSession", () => {
	test("replays tracker estimates over recorded windows", () => {
		const waveform = makeWaveformValues(72);
		const result = replayBayesSession({
			syncSamples: [
				{
					epochTs: 1000,
					sampleRate: 30,
					stage: "tracked",
					filteredWindow: { values: waveform },
					estimators: {
						spectralBpm: 72,
						spectralConfidence: 0.9,
						acfBpm: 71,
						acfConfidence: 0.8,
						instantBpm: 72,
						peakConfidence: 0.7,
						cameraConfidence: 0.88,
						snrDb: 8,
						motion: 0.03,
						bayesBpm: 72,
						bayesConfidence: 0.9,
						finalBpm: 72,
					},
					outputs: { signalQuality: 82 },
				},
				{
					epochTs: 1600,
					sampleRate: 30,
					stage: "tracked",
					filteredWindow: { values: waveform },
					estimators: {
						spectralBpm: 72,
						spectralConfidence: 0.92,
						acfBpm: 72,
						acfConfidence: 0.84,
						instantBpm: 71,
						peakConfidence: 0.68,
						cameraConfidence: 0.9,
						snrDb: 8.5,
						motion: 0.02,
						bayesBpm: 72,
						bayesConfidence: 0.92,
						finalBpm: 72,
					},
					outputs: { signalQuality: 84 },
				},
			],
			pairEvents: [{ ts: 900, referenceBpm: 72 }],
		});

		expect(result.schema).toBe("rppg-bayes-replay/v1");
		expect(result.points).toHaveLength(2);
		expect(result.points[1].replayBayesBpm).not.toBeNull();
		expect(Math.abs((result.points[1].replayBayesBpm ?? 0) - 72)).toBeLessThanOrEqual(3);
		expect(result.pairSummaries[0].replayBayesMae).not.toBeNull();
		expect((result.pairSummaries[0].replayBayesMae ?? 999)).toBeLessThanOrEqual(3);
	});
});
