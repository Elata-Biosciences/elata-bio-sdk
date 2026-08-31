/**
 * Pure, exhaustively tested state machines for the recording protocol.
 *
 * Three machines exist:
 * - the CLIENT recording lifecycle (in-memory, drives the recorder engine),
 * - the HOST session lifecycle (the persisted `SessionState` on catalog rows),
 * - the STREAM lifecycle (`open` → `closed`).
 *
 * All transition rules live in plain data tables so hosts and clients can be
 * verified against the exact same source of truth.
 */

import type { SessionState } from "../contracts/session";
import { BiosignalClientError } from "./errors";

/** Client-side recording lifecycle. */
export type ClientSessionState =
	| "idle"
	| "handshaking"
	| "ready"
	| "creating"
	| "recording"
	| "degraded"
	| "finalizing"
	| "complete"
	| "aborted"
	| "error";

export const CLIENT_SESSION_STATES: readonly ClientSessionState[] = [
	"idle",
	"handshaking",
	"ready",
	"creating",
	"recording",
	"degraded",
	"finalizing",
	"complete",
	"aborted",
	"error",
];

/**
 * Explicit client transitions. In addition to this table, every non-terminal
 * state may transition to `aborted` or `error` (any → aborted | error).
 */
export const CLIENT_TRANSITIONS: Readonly<
	Record<ClientSessionState, readonly ClientSessionState[]>
> = {
	idle: ["handshaking"],
	handshaking: ["ready"],
	ready: ["creating"],
	creating: ["recording"],
	recording: ["degraded", "finalizing"],
	degraded: ["recording", "finalizing"],
	finalizing: ["complete"],
	complete: [],
	aborted: [],
	error: [],
};

const CLIENT_TERMINAL: ReadonlySet<ClientSessionState> = new Set([
	"complete",
	"aborted",
	"error",
]);

export function isClientTerminal(state: ClientSessionState): boolean {
	return CLIENT_TERMINAL.has(state);
}

export function canTransitionClient(
	from: ClientSessionState,
	to: ClientSessionState,
): boolean {
	if (CLIENT_TRANSITIONS[from].includes(to)) return true;
	return (to === "aborted" || to === "error") && !isClientTerminal(from);
}

/** Apply a client transition or throw `bad_state`. Returns the new state. */
export function transitionClient(
	from: ClientSessionState,
	to: ClientSessionState,
): ClientSessionState {
	if (!canTransitionClient(from, to)) {
		throw new BiosignalClientError(
			"bad_state",
			`illegal client transition ${from} → ${to}`,
		);
	}
	return to;
}

/**
 * Host session transitions over the persisted `SessionState`.
 *
 * `recording → complete` covers recovery adoption of interrupted sessions
 * (`endReason: "interrupted"`) and host-initiated finalize (`client-gone`,
 * `storage_full`) without an observable `finalizing` hop. Only sessions at
 * rest (`complete` | `aborted`) may enter `deleting`; `deleting` ends with
 * the row gone, so it has no outgoing transitions.
 */
export const HOST_SESSION_TRANSITIONS: Readonly<
	Record<SessionState, readonly SessionState[]>
> = {
	pending: ["recording", "aborted"],
	recording: ["finalizing", "complete", "aborted"],
	finalizing: ["complete", "aborted"],
	complete: ["deleting"],
	aborted: ["deleting"],
	deleting: [],
};

export function canTransitionSession(
	from: SessionState,
	to: SessionState,
): boolean {
	return HOST_SESSION_TRANSITIONS[from].includes(to);
}

/** Apply a host session transition or throw `bad_state`. */
export function transitionSession(
	from: SessionState,
	to: SessionState,
): SessionState {
	if (!canTransitionSession(from, to)) {
		throw new BiosignalClientError(
			"bad_state",
			`illegal session transition ${from} → ${to}`,
		);
	}
	return to;
}

/** Stream lifecycle: `open` → `closed`, nothing else. */
export type StreamState = "open" | "closed";

export const STREAM_TRANSITIONS: Readonly<
	Record<StreamState, readonly StreamState[]>
> = {
	open: ["closed"],
	closed: [],
};

export function canTransitionStream(
	from: StreamState,
	to: StreamState,
): boolean {
	return STREAM_TRANSITIONS[from].includes(to);
}

/** Apply a stream transition or throw `bad_state`. */
export function transitionStream(
	from: StreamState,
	to: StreamState,
): StreamState {
	if (!canTransitionStream(from, to)) {
		throw new BiosignalClientError(
			"bad_state",
			`illegal stream transition ${from} → ${to}`,
		);
	}
	return to;
}

/** `chunk/commit` is legal only while the session records on an open stream. */
export function canCommitChunk(
	sessionState: SessionState,
	streamState: StreamState,
): boolean {
	return sessionState === "recording" && streamState === "open";
}
