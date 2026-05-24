import {
	isClientRequest,
	isStoredScore,
	isValidScoreValue,
	isValidType,
	PROTOCOL_VERSION,
} from "../protocol";

describe("isValidType", () => {
	test("accepts lowercase, digits, underscore", () => {
		expect(isValidType("level_complete")).toBe(true);
		expect(isValidType("a")).toBe(true);
		expect(isValidType("score_v2")).toBe(true);
	});

	test("rejects empty, uppercase, leading digit, special chars", () => {
		expect(isValidType("")).toBe(false);
		expect(isValidType("Level")).toBe(false);
		expect(isValidType("1foo")).toBe(false);
		expect(isValidType("foo-bar")).toBe(false);
		expect(isValidType("__score__")).toBe(false);
		expect(isValidType(42)).toBe(false);
	});
});

describe("isValidScoreValue", () => {
	test("accepts finite numbers including negative and zero", () => {
		expect(isValidScoreValue(0)).toBe(true);
		expect(isValidScoreValue(42)).toBe(true);
		expect(isValidScoreValue(-1.5)).toBe(true);
	});

	test("rejects NaN, Infinity, non-numbers", () => {
		expect(isValidScoreValue(Number.NaN)).toBe(false);
		expect(isValidScoreValue(Number.POSITIVE_INFINITY)).toBe(false);
		expect(isValidScoreValue(Number.NEGATIVE_INFINITY)).toBe(false);
		expect(isValidScoreValue("42")).toBe(false);
		expect(isValidScoreValue(null)).toBe(false);
		expect(isValidScoreValue(undefined)).toBe(false);
	});
});

describe("isClientRequest", () => {
	const base = { v: PROTOCOL_VERSION, id: "c_1" } as const;

	test("accepts well-formed record", () => {
		expect(
			isClientRequest({ ...base, op: "record", type: "x", data: { a: 1 } }),
		).toBe(true);
	});

	test("accepts well-formed saveScore", () => {
		expect(isClientRequest({ ...base, op: "saveScore", value: 100 })).toBe(true);
		expect(
			isClientRequest({ ...base, op: "saveScore", value: 0, meta: { level: 1 } }),
		).toBe(true);
	});

	test("rejects saveScore with invalid value", () => {
		expect(isClientRequest({ ...base, op: "saveScore", value: Number.NaN })).toBe(
			false,
		);
		expect(isClientRequest({ ...base, op: "saveScore", value: "100" })).toBe(false);
	});

	test("accepts loadScores with filter object", () => {
		expect(isClientRequest({ ...base, op: "loadScores", filter: {} })).toBe(true);
		expect(
			isClientRequest({
				...base,
				op: "loadScores",
				filter: { order: "value_desc", limit: 10 },
			}),
		).toBe(true);
	});

	test("rejects loadScores with non-object filter", () => {
		expect(isClientRequest({ ...base, op: "loadScores", filter: null })).toBe(
			false,
		);
		expect(isClientRequest({ ...base, op: "loadScores" })).toBe(false);
	});

	test("rejects wrong protocol version", () => {
		expect(
			isClientRequest({ v: 2, id: "c_1", op: "record", type: "x", data: 1 }),
		).toBe(false);
	});

	test("rejects missing id", () => {
		expect(isClientRequest({ v: 1, op: "record", type: "x", data: 1 })).toBe(false);
	});

	test("rejects unknown op", () => {
		expect(isClientRequest({ ...base, op: "bogus" })).toBe(false);
	});
});

describe("isStoredScore", () => {
	test("distinguishes scores from records by presence of numeric value", () => {
		expect(
			isStoredScore({
				id: "1",
				walletAddress: "w",
				appId: "a",
				value: 5,
				timestamp: 1,
				sizeBytes: 1,
			}),
		).toBe(true);
		expect(
			isStoredScore({
				id: "1",
				walletAddress: "w",
				appId: "a",
				type: "t",
				data: null,
				timestamp: 1,
				sizeBytes: 1,
			}),
		).toBe(false);
	});
});
