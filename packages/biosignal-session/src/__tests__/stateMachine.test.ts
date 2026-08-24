import {
	CLIENT_SESSION_STATES,
	CLIENT_TRANSITIONS,
	HOST_SESSION_TRANSITIONS,
	STREAM_TRANSITIONS,
	canCommitChunk,
	canTransitionClient,
	canTransitionSession,
	canTransitionStream,
	isClientTerminal,
	transitionClient,
	transitionSession,
	transitionStream,
} from "../protocol/stateMachine";
import type { ClientSessionState } from "../protocol/stateMachine";
import type { SessionState } from "../contracts/session";

const SESSION_STATES: readonly SessionState[] = [
	"pending",
	"recording",
	"finalizing",
	"complete",
	"aborted",
	"deleting",
];

describe("client state machine", () => {
	const happyPath: ClientSessionState[] = [
		"idle",
		"handshaking",
		"ready",
		"creating",
		"recording",
		"finalizing",
		"complete",
	];

	it("accepts the full happy path", () => {
		for (let i = 0; i < happyPath.length - 1; i++) {
			expect(canTransitionClient(happyPath[i], happyPath[i + 1])).toBe(true);
		}
	});

	it("allows recording ⇄ degraded in both directions", () => {
		expect(canTransitionClient("recording", "degraded")).toBe(true);
		expect(canTransitionClient("degraded", "recording")).toBe(true);
		expect(canTransitionClient("degraded", "finalizing")).toBe(true);
	});

	it("allows any non-terminal state to abort or error", () => {
		for (const from of CLIENT_SESSION_STATES) {
			const terminal = isClientTerminal(from);
			expect(canTransitionClient(from, "aborted")).toBe(!terminal);
			expect(canTransitionClient(from, "error")).toBe(!terminal);
		}
	});

	it("treats complete, aborted, and error as terminal", () => {
		expect(isClientTerminal("complete")).toBe(true);
		expect(isClientTerminal("aborted")).toBe(true);
		expect(isClientTerminal("error")).toBe(true);
		expect(isClientTerminal("recording")).toBe(false);
	});

	it("exhaustively rejects every transition not in the table", () => {
		for (const from of CLIENT_SESSION_STATES) {
			for (const to of CLIENT_SESSION_STATES) {
				const tabled = CLIENT_TRANSITIONS[from].includes(to);
				const abortOrError =
					(to === "aborted" || to === "error") && !isClientTerminal(from);
				expect(canTransitionClient(from, to)).toBe(tabled || abortOrError);
			}
		}
	});

	it("rejects self-transitions everywhere", () => {
		for (const state of CLIENT_SESSION_STATES) {
			expect(canTransitionClient(state, state)).toBe(false);
		}
	});

	it("transitionClient returns the target on a legal move and throws bad_state otherwise", () => {
		expect(transitionClient("idle", "handshaking")).toBe("handshaking");
		expect(() => transitionClient("idle", "recording")).toThrow(
			expect.objectContaining({ code: "bad_state" }),
		);
		expect(() => transitionClient("complete", "aborted")).toThrow(
			expect.objectContaining({ code: "bad_state" }),
		);
	});
});

describe("host session state machine", () => {
	it("accepts the persisted happy path", () => {
		expect(canTransitionSession("pending", "recording")).toBe(true);
		expect(canTransitionSession("recording", "finalizing")).toBe(true);
		expect(canTransitionSession("finalizing", "complete")).toBe(true);
	});

	it("allows abort from pending, recording, and finalizing", () => {
		expect(canTransitionSession("pending", "aborted")).toBe(true);
		expect(canTransitionSession("recording", "aborted")).toBe(true);
		expect(canTransitionSession("finalizing", "aborted")).toBe(true);
	});

	it("allows recovery adoption recording → complete", () => {
		expect(canTransitionSession("recording", "complete")).toBe(true);
	});

	it("only complete and aborted may enter deleting; deleting is terminal", () => {
		expect(canTransitionSession("complete", "deleting")).toBe(true);
		expect(canTransitionSession("aborted", "deleting")).toBe(true);
		expect(canTransitionSession("pending", "deleting")).toBe(false);
		expect(canTransitionSession("recording", "deleting")).toBe(false);
		for (const to of SESSION_STATES) {
			expect(canTransitionSession("deleting", to)).toBe(false);
		}
	});

	it("exhaustively matches the transition table", () => {
		for (const from of SESSION_STATES) {
			for (const to of SESSION_STATES) {
				expect(canTransitionSession(from, to)).toBe(
					HOST_SESSION_TRANSITIONS[from].includes(to),
				);
			}
		}
	});

	it("transitionSession throws bad_state on illegal moves", () => {
		expect(transitionSession("pending", "recording")).toBe("recording");
		expect(() => transitionSession("complete", "recording")).toThrow(
			expect.objectContaining({ code: "bad_state" }),
		);
	});
});

describe("stream state machine", () => {
	it("only open → closed is legal", () => {
		expect(canTransitionStream("open", "closed")).toBe(true);
		expect(canTransitionStream("closed", "open")).toBe(false);
		expect(canTransitionStream("open", "open")).toBe(false);
		expect(canTransitionStream("closed", "closed")).toBe(false);
		expect(STREAM_TRANSITIONS.open).toEqual(["closed"]);
		expect(STREAM_TRANSITIONS.closed).toEqual([]);
	});

	it("transitionStream throws bad_state on illegal moves", () => {
		expect(transitionStream("open", "closed")).toBe("closed");
		expect(() => transitionStream("closed", "open")).toThrow(
			expect.objectContaining({ code: "bad_state" }),
		);
	});
});

describe("chunk-commit legality", () => {
	it("is legal only while the session records and the stream is open", () => {
		expect(canCommitChunk("recording", "open")).toBe(true);
		expect(canCommitChunk("recording", "closed")).toBe(false);
		for (const state of SESSION_STATES) {
			if (state === "recording") continue;
			expect(canCommitChunk(state, "open")).toBe(false);
		}
	});
});
