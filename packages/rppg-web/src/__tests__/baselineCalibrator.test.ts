import {
	BaselineCalibrator,
	DEFAULT_BASELINE_CALIBRATOR_CONFIG,
} from "../baselineCalibrator";

const cfg = DEFAULT_BASELINE_CALIBRATOR_CONFIG;

describe("BaselineCalibrator", () => {
	it("progress only ever climbs (never retreats)", () => {
		const c = new BaselineCalibrator();
		let last = 0;
		// Feed jittery-but-in-range readings; progress must be monotonic.
		for (let i = 0; i < cfg.minForStability - 1; i++) {
			c.push(70 + (i % 2 === 0 ? 4 : -4), 45); // ±4 bpm wobble (within outlier band)
			expect(c.progress).toBeGreaterThanOrEqual(last);
			last = c.progress;
		}
	});

	it("rejects an out-of-range spike instead of dropping progress", () => {
		const c = new BaselineCalibrator();
		for (let i = 0; i < 8; i++) c.push(70, 45);
		const before = c.sampleCount;
		c.push(70 + cfg.outlierBpm + 20, 45); // big spike → rejected
		expect(c.sampleCount).toBe(before); // not counted, progress held
	});

	it("reaches 100% and completes once the reading converges", () => {
		const c = new BaselineCalibrator();
		// Steady 72 bpm → low stdDev → early-exit after minForStability.
		for (let i = 0; i < cfg.minForStability + 2; i++) c.push(72, 48);
		expect(c.isComplete).toBe(true);
		expect(c.progress).toBe(1);
	});

	it("does not complete early while the reading is still drifting", () => {
		const c = new BaselineCalibrator();
		// Monotonic drift keeps stdDev above the threshold.
		for (let i = 0; i < cfg.minForStability + 2; i++) c.push(70 + i * 0.8, 45);
		// Drifting by ~0.8 bpm/sample over the window → stdDev > 2.5, not converged,
		// and below the needed count → not complete yet.
		expect(c.isComplete).toBe(false);
		expect(c.progress).toBeLessThan(1);
	});

	it("completes at the needed count even without convergence", () => {
		const c = new BaselineCalibrator();
		// Alternate within the outlier band so it never "converges" but still fills.
		for (let i = 0; i < cfg.neededSamples + 5; i++) c.push(70 + (i % 2 ? 6 : -6), 45);
		expect(c.isComplete).toBe(true);
	});

	it("returns a trimmed-median baseline", () => {
		const c = new BaselineCalibrator();
		for (let i = 0; i < 20; i++) c.push(70, 45);
		c.push(200, 45); // extreme — should be rejected as an outlier anyway
		const r = c.result();
		expect(r.bpm).toBe(70);
		expect(r.hrv).toBe(45);
	});

	it("reports null result before any samples", () => {
		expect(new BaselineCalibrator().result()).toEqual({ bpm: null, hrv: null });
	});

	it("is highly confident in a steady, high-quality read", () => {
		const c = new BaselineCalibrator();
		for (let i = 0; i < 25; i++) c.push(72, 48, 0.9);
		expect(c.confidence).toBeGreaterThan(0.8);
	});

	it("is low-confidence when the signal quality was poor", () => {
		const c = new BaselineCalibrator();
		for (let i = 0; i < 25; i++) c.push(72, 48, 0.05); // steady but barely-there signal
		expect(c.confidence).toBeLessThan(0.6);
	});

	it("drops confidence when many frames were rejected as outliers", () => {
		const c = new BaselineCalibrator();
		for (let i = 0; i < 20; i++) c.push(72, 48, 0.9);
		for (let i = 0; i < 40; i++) c.push(72 + 60, 48, 0.9); // spikes → rejected
		expect(c.confidence).toBeLessThan(0.75);
	});

	it("zero confidence with no samples", () => {
		expect(new BaselineCalibrator().confidence).toBe(0);
	});

	it("reset clears all accumulated state", () => {
		const c = new BaselineCalibrator();
		for (let i = 0; i < 10; i++) c.push(72, 48, 0.9);
		c.reset();
		expect(c.sampleCount).toBe(0);
		expect(c.progress).toBe(0);
		expect(c.confidence).toBe(0);
		expect(c.result()).toEqual({ bpm: null, hrv: null });
	});
});
