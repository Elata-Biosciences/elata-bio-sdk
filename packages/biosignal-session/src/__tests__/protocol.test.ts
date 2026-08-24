import { isValidName } from "../contracts/ids";
import {
	BiosignalClientError,
	RETRYABLE_ERROR_CODES,
	isRetryableError,
} from "../protocol/errors";
import {
	BIOSIGNAL_INIT_MESSAGE_KIND,
	BIOSIGNAL_LIMITS,
	BIOSIGNAL_PROTOCOL_VERSION,
	CLIENT_OPS,
	isBiosignalInitMessage,
	isClientRequest,
	isHostResponse,
} from "../protocol/messages";

describe("init handshake message", () => {
	it("accepts the canonical init message", () => {
		expect(
			isBiosignalInitMessage({ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 }),
		).toBe(true);
	});

	it("rejects the metrics init kind — separate channels by design", () => {
		expect(isBiosignalInitMessage({ kind: "__elata_metrics_init", v: 1 })).toBe(false);
	});

	it("rejects version mismatches and malformed values", () => {
		expect(isBiosignalInitMessage({ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 2 })).toBe(
			false,
		);
		expect(isBiosignalInitMessage(null)).toBe(false);
		expect(isBiosignalInitMessage("init")).toBe(false);
		expect(isBiosignalInitMessage({})).toBe(false);
	});
});

describe("client request guard", () => {
	it("accepts every declared op", () => {
		for (const op of CLIENT_OPS) {
			expect(isClientRequest({ v: 1, id: "r1", op })).toBe(true);
		}
	});

	it("rejects unknown ops, missing ids, and wrong versions", () => {
		expect(isClientRequest({ v: 1, id: "r1", op: "session/hijack" })).toBe(false);
		expect(isClientRequest({ v: 1, id: "", op: "ping" })).toBe(false);
		expect(isClientRequest({ v: 2, id: "r1", op: "ping" })).toBe(false);
		expect(isClientRequest({ id: "r1", op: "ping" })).toBe(false);
		expect(isClientRequest(null)).toBe(false);
	});
});

describe("host response guard", () => {
	it("accepts ok, error, and notice shapes", () => {
		expect(isHostResponse({ v: 1, id: "r1", ok: true })).toBe(true);
		expect(
			isHostResponse({ v: 1, id: "r1", ok: false, error: "internal", retryable: true }),
		).toBe(true);
		expect(isHostResponse({ v: 1, kind: "host/notice", notice: "quota-warning" })).toBe(
			true,
		);
	});

	it("rejects version mismatches and malformed values", () => {
		expect(isHostResponse({ v: 2, id: "r1", ok: true })).toBe(false);
		expect(isHostResponse({ v: 1, id: "r1" })).toBe(false);
		expect(isHostResponse(undefined)).toBe(false);
	});
});

describe("error classification", () => {
	it("treats only transient failures as retryable", () => {
		expect(isRetryableError("internal")).toBe(true);
		expect(isRetryableError("storage_unavailable")).toBe(true);
		expect(isRetryableError("rate_limited")).toBe(true);
		expect(isRetryableError("sequence_conflict")).toBe(false);
		expect(isRetryableError("checksum_mismatch")).toBe(false);
		expect(isRetryableError("quota_exceeded")).toBe(false);
		expect(RETRYABLE_ERROR_CODES.size).toBe(3);
	});

	it("BiosignalClientError carries code and retryability", () => {
		expect(new BiosignalClientError("rate_limited").retryable).toBe(true);
		expect(new BiosignalClientError("handshake_timeout").retryable).toBe(false);
		expect(new BiosignalClientError("disposed").code).toBe("disposed");
	});
});

describe("names and limits", () => {
	it("validates event names", () => {
		expect(isValidName("round_started")).toBe(true);
		expect(isValidName("app.neurochess.round-1")).toBe(true);
		expect(isValidName("Round")).toBe(false);
		expect(isValidName("9lives")).toBe(false);
		expect(isValidName(`a${"b".repeat(64)}`)).toBe(false);
		expect(isValidName("")).toBe(false);
	});

	it("keeps protocol constants at their contract values", () => {
		expect(BIOSIGNAL_PROTOCOL_VERSION).toBe(1);
		expect(BIOSIGNAL_LIMITS.maxChunkBytes).toBe(8 * 1024 * 1024);
		expect(BIOSIGNAL_LIMITS.defaultInFlightWindow).toBe(4);
		expect(BIOSIGNAL_LIMITS.maxEventPayloadBytes).toBe(4096);
	});
});
