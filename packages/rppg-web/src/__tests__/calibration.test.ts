import { calibrationStage } from "../calibration";

describe("calibrationStage", () => {
	const base = {
		paused: false,
		locked: false,
		conditionsGood: true,
		trustworthy: false,
		progressPct: 0,
	};

	test('is "positioning" when conditions are not good: no progress on bad data', () => {
		expect(calibrationStage({ ...base, conditionsGood: false })).toBe("positioning");
		// Bad conditions win even after progress accrues or the read looks trusted
		// (e.g. drifting out of frame mid-scan).
		expect(calibrationStage({ ...base, conditionsGood: false, progressPct: 40 })).toBe(
			"positioning",
		);
		expect(calibrationStage({ ...base, conditionsGood: false, trustworthy: true })).toBe(
			"positioning",
		);
	});

	test('is "acquiring" on a good signal before any progress (warm-up)', () => {
		expect(calibrationStage({ ...base, progressPct: 0 })).toBe("acquiring");
	});

	describe("the calibrator restarting", () => {
		// The SDK empties its own buffer after ten rejects in a row before sample 18.
		// The ring cannot retreat (its high-water mark is right about that), so
		// without a stage of its own the only thing the reader gets is a bar that has
		// stopped dead for five seconds or more. That silence is what was reported as
		// lag.
		test("says so while the count is building again", () => {
			expect(calibrationStage({ ...base, progressPct: 60, restarted: true })).toBe(
				"restarting",
			);
		});

		test("never displaces advice the reader can act on", () => {
			// "Hold still, more light" is actionable. "Starting again" is not, so it
			// must never take the place of the first.
			expect(
				calibrationStage({ ...base, conditionsGood: false, restarted: true, progressPct: 60 }),
			).toBe("positioning");
			expect(calibrationStage({ ...base, paused: true, restarted: true })).toBe("paused");
			expect(calibrationStage({ ...base, locked: true, restarted: true })).toBe("locked");
			expect(calibrationStage({ ...base, armed: false, restarted: true })).toBe("ready");
		});

		test("gets out of the way once the reading is trustworthy again", () => {
			expect(calibrationStage({ ...base, trustworthy: true, restarted: false })).toBe(
				"measuring",
			);
		});
	});

	test('is "calibrating" while a clean read builds toward trust', () => {
		expect(calibrationStage({ ...base, progressPct: 1 })).toBe("calibrating");
		expect(calibrationStage({ ...base, progressPct: 80 })).toBe("calibrating");
	});

	test('is "measuring" once the framed read is trustworthy (capturing the reading)', () => {
		expect(calibrationStage({ ...base, trustworthy: true, progressPct: 95 })).toBe("measuring");
	});

	test('reports "locked" when complete', () => {
		expect(
			calibrationStage({ ...base, locked: true, trustworthy: true, progressPct: 100 }),
		).toBe("locked");
	});

	test("an explicit pause wins over every other stage", () => {
		expect(calibrationStage({ ...base, paused: true, locked: true, progressPct: 100 })).toBe(
			"paused",
		);
		expect(calibrationStage({ ...base, paused: true, conditionsGood: false })).toBe("paused");
		expect(calibrationStage({ ...base, paused: true, trustworthy: true })).toBe("paused");
	});

	test("a lock wins over the in-progress capture", () => {
		expect(calibrationStage({ ...base, locked: true, trustworthy: true, progressPct: 40 })).toBe(
			"locked",
		);
	});

	describe("adapting to light", () => {
		/**
		 * Reported 2026-08-02: numbers come back too high when calibrating in the
		 * dark, and the reading starts before the light has adapted. This stage
		 * exists so nothing is gathered, and nothing is BLAMED ON THE READER,
		 * while the app's own fill-light and the camera's exposure are still
		 * moving.
		 */
		test("wins over positioning: nothing to fix is not the same message as bad conditions", () => {
			expect(calibrationStage({ ...base, conditionsGood: false, adaptingLight: true })).toBe(
				"adapting-light",
			);
		});

		test("wins over acquiring and calibrating too: any accrual during this window is what broke", () => {
			expect(calibrationStage({ ...base, progressPct: 0, adaptingLight: true })).toBe(
				"adapting-light",
			);
			expect(calibrationStage({ ...base, progressPct: 40, adaptingLight: true })).toBe(
				"adapting-light",
			);
			expect(
				calibrationStage({ ...base, trustworthy: true, progressPct: 95, adaptingLight: true }),
			).toBe("adapting-light");
		});

		test("never displaces pause or lock: those are more true than \"still adjusting\"", () => {
			expect(calibrationStage({ ...base, paused: true, adaptingLight: true })).toBe("paused");
			expect(calibrationStage({ ...base, locked: true, adaptingLight: true })).toBe("locked");
			expect(calibrationStage({ ...base, armed: false, adaptingLight: true })).toBe("ready");
		});

		test("the anti-vacuity partner: false/absent behaves exactly as before this field existed", () => {
			expect(calibrationStage({ ...base, adaptingLight: false })).toBe("acquiring");
			expect(calibrationStage({ ...base })).toBe("acquiring");
		});
	});
});

describe("held (unarmed) capture", () => {
	test("reports the ready stage, whatever the signal is doing", () => {
		// A ring that reads "getting a clear signal" while the capture is held IS
		// calibration to the person watching, whatever the internals do.
		expect(
			calibrationStage({
				paused: false,
				locked: false,
				conditionsGood: true,
				trustworthy: true,
				progressPct: 80,
				armed: false,
			}),
		).toBe("ready");
	});

	test("armed defaulting to true preserves every existing stage decision", () => {
		expect(
			calibrationStage({
				paused: false,
				locked: false,
				conditionsGood: true,
				trustworthy: true,
				progressPct: 80,
			}),
		).toBe("measuring");
	});
});
