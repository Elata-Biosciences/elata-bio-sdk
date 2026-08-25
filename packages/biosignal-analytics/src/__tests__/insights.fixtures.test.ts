/**
 * Shared headline-score fixture.
 *
 * `fixtures/insights/score-fixtures.json` is the cross-repo contract for the
 * score formulas, the same way `biosignal-protocol-v1.json` is for the wire
 * protocol: this package is canonical, the App Store keeps a verbatim copy,
 * and both assert against it. If a formula changes, regenerate with
 * `scripts/generate-score-fixtures.mjs` and land the new file in BOTH repos —
 * a drifting mirror then fails loudly instead of quietly disagreeing.
 *
 * The expected values come from this implementation's own output, so this
 * suite is a regression guard rather than an independent derivation: it fails
 * when behaviour changes, which is exactly what the mirror needs to know.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	robustZFromBaseline,
	scoreActivation,
	scoreFocus,
	scoreMeasurementQuality,
	scoreReadiness,
	scoreRecovery,
	scoreResilience,
} from "../insights/index.js";

const fixturePath = path.resolve(
	__dirname,
	"..",
	"..",
	"fixtures",
	"insights",
	"score-fixtures.json",
);

interface FixtureCase {
	id: string;
	description: string;
	algorithm: string;
	input: Record<string, unknown>;
	expected: Record<string, unknown>;
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
	algorithms: string[];
	cases: FixtureCase[];
};

function actualFor(testCase: FixtureCase): unknown {
	switch (testCase.algorithm) {
		case "score_measurement_quality@1":
			return scoreMeasurementQuality(
				testCase.input as Parameters<typeof scoreMeasurementQuality>[0],
			);
		case "score_activation@1":
			return scoreActivation(
				testCase.input as Parameters<typeof scoreActivation>[0],
			);
		case "score_recovery@2":
			return scoreRecovery(
				testCase.input as Parameters<typeof scoreRecovery>[0],
			);
		case "score_focus@1":
			return scoreFocus(testCase.input as Parameters<typeof scoreFocus>[0]);
		case "score_readiness@1":
			return scoreReadiness(
				testCase.input as Parameters<typeof scoreReadiness>[0],
			);
		case "score_resilience@1":
			return scoreResilience(
				testCase.input as Parameters<typeof scoreResilience>[0],
			);
		case "robust_z@1": {
			const input = testCase.input as { value: number; baseline: unknown };
			return robustZFromBaseline(
				input.value,
				input.baseline as Parameters<typeof robustZFromBaseline>[1],
			);
		}
		default:
			throw new Error(`unknown algorithm in fixture: ${testCase.algorithm}`);
	}
}

describe("shared score fixture", () => {
	it("covers every algorithm it claims to", () => {
		const covered = new Set(fixture.cases.map((testCase) => testCase.algorithm));
		expect([...covered].sort()).toEqual([...fixture.algorithms].sort());
	});

	it("includes withhold cases, not just happy paths", () => {
		const withheld = fixture.cases.filter(
			(testCase) => (testCase.expected as { value?: unknown }).value === null,
		);
		// A score that can never withhold is the failure mode this guards.
		expect(withheld.length).toBeGreaterThanOrEqual(3);
		for (const testCase of withheld) {
			expect((testCase.expected as { withheldReason?: unknown }).withheldReason)
				.toBeDefined();
		}
	});

	it("gives every score algorithm at least one withheld case", () => {
		// Per-algorithm, not just in aggregate: a new score could otherwise
		// land here with six happy paths and no proof it can decline.
		const scoreAlgorithms = fixture.algorithms.filter((id) =>
			id.startsWith("score_"),
		);
		expect(scoreAlgorithms.length).toBeGreaterThanOrEqual(6);
		for (const algorithm of scoreAlgorithms) {
			const cases = fixture.cases.filter(
				(testCase) => testCase.algorithm === algorithm,
			);
			const withheld = cases.filter(
				(testCase) => (testCase.expected as { value?: unknown }).value === null,
			);
			expect([algorithm, withheld.length > 0]).toEqual([algorithm, true]);
			expect([algorithm, cases.length > withheld.length]).toEqual([
				algorithm,
				true,
			]);
		}
	});

	it("never publishes a neutral 50 in place of a withheld score", () => {
		for (const testCase of fixture.cases) {
			const expected = testCase.expected as {
				value?: unknown;
				withheldReason?: unknown;
			};
			if (expected.withheldReason === undefined) continue;
			expect([testCase.id, expected.value]).toEqual([testCase.id, null]);
		}
	});

	it("every score case carries its contributors and its measurement quality", () => {
		for (const testCase of fixture.cases) {
			if (!testCase.algorithm.startsWith("score_")) continue;
			const expected = testCase.expected as {
				contributors?: unknown[];
				measurementQuality?: unknown;
			};
			expect([testCase.id, (expected.contributors ?? []).length > 0]).toEqual([
				testCase.id,
				true,
			]);
			expect([testCase.id, typeof expected.measurementQuality]).toEqual([
				testCase.id,
				"number",
			]);
		}
	});

	it.each(fixture.cases.map((testCase) => [testCase.id, testCase] as const))(
		"reproduces %s",
		(_id, testCase) => {
			expect(actualFor(testCase)).toEqual(testCase.expected);
		},
	);
});
