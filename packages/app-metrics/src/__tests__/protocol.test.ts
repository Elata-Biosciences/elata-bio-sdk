import {
	isClientRequest,
	isValidType,
	toAppRecord,
} from "../protocol";

describe("isValidType", () => {
	it("accepts snake_case ascii lowercase", () => {
		expect(isValidType("level_complete")).toBe(true);
		expect(isValidType("a")).toBe(true);
		expect(isValidType("a1_b2")).toBe(true);
	});

	it("rejects uppercase, leading digit, dashes, spaces", () => {
		expect(isValidType("Level")).toBe(false);
		expect(isValidType("1score")).toBe(false);
		expect(isValidType("score-final")).toBe(false);
		expect(isValidType("score final")).toBe(false);
		expect(isValidType("")).toBe(false);
	});

	it("rejects non-string", () => {
		expect(isValidType(42)).toBe(false);
		expect(isValidType(null)).toBe(false);
		expect(isValidType(undefined)).toBe(false);
	});

	it("rejects types longer than 64 chars", () => {
		expect(isValidType("a".repeat(64))).toBe(true);
		expect(isValidType("a".repeat(65))).toBe(false);
	});
});

describe("isClientRequest", () => {
	it("accepts record/query/clear with correct shape", () => {
		expect(
			isClientRequest({ v: 1, id: "x", op: "record", type: "foo", data: 1 }),
		).toBe(true);
		expect(
			isClientRequest({ v: 1, id: "x", op: "query", filter: { limit: 10 } }),
		).toBe(true);
		expect(
			isClientRequest({ v: 1, id: "x", op: "clear", scope: "app" }),
		).toBe(true);
	});

	it("rejects bad versions / missing id", () => {
		expect(
			isClientRequest({ v: 2, id: "x", op: "record", type: "foo", data: 1 }),
		).toBe(false);
		expect(
			isClientRequest({ v: 1, id: "", op: "record", type: "foo", data: 1 }),
		).toBe(false);
	});

	it("rejects unknown op", () => {
		expect(isClientRequest({ v: 1, id: "x", op: "drop" })).toBe(false);
	});

	it("rejects record with undefined data or invalid type", () => {
		expect(
			isClientRequest({ v: 1, id: "x", op: "record", type: "Foo", data: 1 }),
		).toBe(false);
		expect(isClientRequest({ v: 1, id: "x", op: "record", type: "foo" })).toBe(
			false,
		);
	});

	it("rejects clear with wrong scope", () => {
		expect(isClientRequest({ v: 1, id: "x", op: "clear", scope: "all" })).toBe(
			false,
		);
	});
});

describe("toAppRecord", () => {
	it("strips host-only fields", () => {
		const app = toAppRecord({
			id: "r1",
			walletAddress: "0xabc",
			appId: "app1",
			type: "foo",
			data: { n: 1 },
			timestamp: 12345,
			sizeBytes: 99,
		});
		expect(app).toEqual({ id: "r1", type: "foo", data: { n: 1 }, timestamp: 12345 });
		expect((app as Record<string, unknown>).walletAddress).toBeUndefined();
		expect((app as Record<string, unknown>).sizeBytes).toBeUndefined();
	});
});
