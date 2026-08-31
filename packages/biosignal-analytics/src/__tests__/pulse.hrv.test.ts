import * as fs from "node:fs";
import * as path from "node:path";
import { cleanNnIntervalsMs } from "../pulse/ibi.js";
import { hrvTimeDomain } from "../pulse/hrv.js";
import { expectClose, loadGoldenFixture } from "../testing/fixtures.js";
import { syntheticIbisMs } from "../testing/synthetic.js";

const FIXTURES_DIR = path.resolve(__dirname, "..", "..", "fixtures");
const read = (file: string): string => fs.readFileSync(file, "utf8");

const fixture = loadGoldenFixture(read, FIXTURES_DIR, "pulse/hrv_time_domain.json");
const ATOL = { atol: 0.5 };

describe("hrv_time_domain@1 parity (nn_clean@1 + meanNN/SDNN/RMSSD)", () => {
	for (const testCase of fixture.cases) {
		test(testCase.name, () => {
			const ibis = testCase.input.ibisMs as number[];
			const expected = testCase.expected as Record<string, unknown>;
			const actual = hrvTimeDomain(ibis);

			expect(actual.ibiCount).toBe(expected.ibiCount);
			expect([...actual.cleanedNnMs]).toEqual(expected.cleanedNnMs);
			expectClose(
				actual.usableIbiFraction,
				expected.usableIbiFraction as number,
				{ atol: 1e-9 },
				`${testCase.name}.usableIbiFraction`,
			);
			for (const key of ["meanNnMs", "sdnnMs", "rmssdMs"] as const) {
				const expectedValue = expected[key] as number | null;
				if (expectedValue === null) {
					expect(actual[key]).toBeNull();
				} else {
					expect(actual[key]).not.toBeNull();
					expectClose(actual[key] as number, expectedValue, ATOL, `${testCase.name}.${key}`);
				}
			}
		});
	}
});

describe("cleaning behavior", () => {
	test("out-of-range intervals are dropped before the median filter", () => {
		const cleaned = cleanNnIntervalsMs([100, 800, 810, 790, 2500, 805]);
		expect(cleaned).toEqual([800, 810, 790, 805]);
	});

	test("ectopic short/long pairs are rejected by the median filter", () => {
		const ibis = syntheticIbisMs({ seed: 5, count: 60, ectopicAt: [20] });
		const result = hrvTimeDomain(ibis);
		expect(result.cleanedNnMs).not.toContain(400);
		expect(result.cleanedNnMs).not.toContain(1250);
		expect(result.usableIbiFraction).toBeLessThan(1);
		expect(result.usableIbiFraction).toBeGreaterThan(0.9);
	});

	test("non-finite values never pass cleaning", () => {
		expect(cleanNnIntervalsMs([Number.NaN, Number.POSITIVE_INFINITY, 800, 805])).toEqual([
			800, 805,
		]);
	});

	test("empty input yields nulls and zero fraction", () => {
		const result = hrvTimeDomain([]);
		expect(result.ibiCount).toBe(0);
		expect(result.usableIbiFraction).toBe(0);
		expect(result.meanNnMs).toBeNull();
		expect(result.sdnnMs).toBeNull();
		expect(result.rmssdMs).toBeNull();
	});
});
