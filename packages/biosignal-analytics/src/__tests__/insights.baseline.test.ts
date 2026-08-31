import * as fs from "node:fs";
import * as path from "node:path";
import {
	BASELINE_MIN_SESSIONS,
	isBaselineUsable,
	robustZFromBaseline,
	type PersonalBaseline,
} from "../insights/baseline.js";
import { expectClose, loadGoldenFixture } from "../testing/fixtures.js";

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "fixtures");
const read = (file: string): string => fs.readFileSync(file, "utf8");

function baselineOf(median: number, mad: number, sessionCount = 10): PersonalBaseline {
	return {
		metricId: "pulse.heart_rate",
		contextBucket: "any",
		median,
		mad,
		sessionCount,
		updatedAtMs: 0,
	};
}

describe("robustZFromBaseline (robust_z@1)", () => {
	test("matches the golden robust-z probes", () => {
		const fixture = loadGoldenFixture(read, FIXTURES_DIR, "stats/robust_summary.json");
		for (const testCase of fixture.cases) {
			const robust = testCase.expected.robust as {
				median: number | null;
				mad: number | null;
			};
			if (robust.median === null || robust.mad === null) continue;
			const probes = testCase.expected.robustZProbes as { value: number; robustZ: number }[];
			for (const probe of probes) {
				const { z } = robustZFromBaseline(probe.value, baselineOf(robust.median, robust.mad));
				expectClose(
					z,
					probe.robustZ,
					{ rtol: 1e-4, atol: 1e-9 },
					`${testCase.name} robustZ(${probe.value})`,
				);
			}
		}
	});

	test("clamps to ±3", () => {
		expect(robustZFromBaseline(1e9, baselineOf(0, 1)).z).toBe(3);
		expect(robustZFromBaseline(-1e9, baselineOf(0, 1)).z).toBe(-3);
	});

	test("degenerate MAD yields z=0 with an explicit flag", () => {
		const result = robustZFromBaseline(42, baselineOf(10, 0));
		expect(result.z).toBe(0);
		expect(result.degenerate).toBe(true);
		expect(robustZFromBaseline(42, baselineOf(10, 5)).degenerate).toBe(false);
	});
});

describe("isBaselineUsable", () => {
	test("requires at least BASELINE_MIN_SESSIONS sessions", () => {
		expect(isBaselineUsable(null)).toBe(false);
		expect(isBaselineUsable(baselineOf(60, 4, BASELINE_MIN_SESSIONS - 1))).toBe(false);
		expect(isBaselineUsable(baselineOf(60, 4, BASELINE_MIN_SESSIONS))).toBe(true);
	});
});
