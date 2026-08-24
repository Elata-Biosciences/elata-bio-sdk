import * as fs from "node:fs";
import * as path from "node:path";
import { robustStats, robustZ } from "../statistics/robust.js";
import { percentileSorted, summaryStats } from "../statistics/summary.js";
import { expectClose, loadGoldenFixture } from "../testing/fixtures.js";

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "fixtures");
const read = (file: string): string => fs.readFileSync(file, "utf8");

const fixture = loadGoldenFixture(read, FIXTURES_DIR, "stats/robust_summary.json");
const RTOL = { rtol: 1e-4, atol: 1e-9 };

function valueOf(record: Record<string, unknown>, key: string): number | null {
	const value = record[key];
	return value === null ? null : (value as number);
}

describe("summary_stats@1 parity", () => {
	for (const testCase of fixture.cases) {
		test(testCase.name, () => {
			const values = testCase.input.values as number[];
			const expected = testCase.expected.summary as Record<string, unknown>;
			const actual = summaryStats(values);
			expect(actual.count).toBe(expected.count);
			for (const key of [
				"mean",
				"median",
				"min",
				"max",
				"std",
				"variance",
				"p5",
				"p25",
				"p50",
				"p75",
				"p95",
				"iqr",
				"cv",
			] as const) {
				const expectedValue = valueOf(expected, key);
				const actualValue = actual[key];
				if (expectedValue === null) {
					expect(actualValue).toBeNull();
				} else {
					expect(actualValue).not.toBeNull();
					expectClose(actualValue as number, expectedValue, RTOL, `${testCase.name}.${key}`);
				}
			}
		});
	}
});

describe("robust_stats@1 + robust_z@1 parity", () => {
	for (const testCase of fixture.cases) {
		test(testCase.name, () => {
			const values = testCase.input.values as number[];
			const expected = testCase.expected.robust as Record<string, unknown>;
			const actual = robustStats(values);
			for (const key of ["median", "mad", "madScaled"] as const) {
				const expectedValue = valueOf(expected, key);
				if (expectedValue === null) {
					expect(actual[key]).toBeNull();
				} else {
					expectClose(actual[key] as number, expectedValue, RTOL, `${testCase.name}.${key}`);
				}
			}
			const probes = testCase.expected.robustZProbes as {
				value: number;
				robustZ: number;
			}[];
			for (const probe of probes) {
				expectClose(
					robustZ(probe.value, actual.median as number, actual.mad as number),
					probe.robustZ,
					RTOL,
					`${testCase.name}.robustZ(${probe.value})`,
				);
			}
		});
	}
});

describe("edge behavior", () => {
	test("percentileSorted handles single values and exact ranks", () => {
		expect(percentileSorted([5], 50)).toBe(5);
		expect(percentileSorted([1, 2, 3, 4, 5], 50)).toBe(3);
		expect(percentileSorted([1, 2, 3, 4], 50)).toBe(2.5);
	});

	test("robustZ clamps to ±3 and degrades to 0 on zero MAD", () => {
		expect(robustZ(1000, 0, 1)).toBe(3);
		expect(robustZ(-1000, 0, 1)).toBe(-3);
		expect(robustZ(42, 0, 0)).toBe(0);
	});

	test("summaryStats of empty input is all-null", () => {
		const stats = summaryStats([]);
		expect(stats.count).toBe(0);
		expect(stats.mean).toBeNull();
		expect(stats.cv).toBeNull();
	});
});
