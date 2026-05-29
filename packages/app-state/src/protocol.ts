/**
 * Wire protocol between the sandboxed app (client) and the appstore host
 * for per-user, per-app key-value storage. Mirrors the request/response
 * postMessage pattern used by `@elata-biosciences/app-payments`.
 *
 * The app sends `elata:state:get` / `elata:state:set` / `elata:state:delete`
 * to `window.parent`. The host validates `event.origin === embedOrigin`,
 * fetches the matching session-authed route on the app's behalf, and
 * replies with an `:result` message keyed by `requestId`.
 */

export const PROTOCOL_VERSION = 1 as const;

export const GET_MESSAGE_TYPE = "elata:state:get" as const;
export const GET_RESULT_MESSAGE_TYPE = "elata:state:get:result" as const;
export const SET_MESSAGE_TYPE = "elata:state:set" as const;
export const SET_RESULT_MESSAGE_TYPE = "elata:state:set:result" as const;
export const DELETE_MESSAGE_TYPE = "elata:state:delete" as const;
export const DELETE_RESULT_MESSAGE_TYPE = "elata:state:delete:result" as const;

/** Host-enforced bounds on `requestId` length. Mirror these on the client. */
export const REQUEST_ID_MIN_LENGTH = 8;
export const REQUEST_ID_MAX_LENGTH = 128;

/** Host-enforced bounds on `key` length. Charset is enforced on the host. */
export const KEY_MAX_LENGTH = 256;

export interface StateGetMessage {
	type: typeof GET_MESSAGE_TYPE;
	requestId: string;
	key: string;
}

export interface StateGetResultMessage {
	type: typeof GET_RESULT_MESSAGE_TYPE;
	requestId: string;
	/** Present on success. `null` if the key does not exist. */
	value?: unknown;
	/** Present on failure. Codes: `not_authenticated`, `invalid_input`, `fetch_failed`. */
	error?: string;
}

export interface StateSetMessage {
	type: typeof SET_MESSAGE_TYPE;
	requestId: string;
	key: string;
	value: unknown;
}

export interface StateSetResultMessage {
	type: typeof SET_RESULT_MESSAGE_TYPE;
	requestId: string;
	ok?: true;
	/** Codes: `not_authenticated`, `invalid_input`, `value_too_large`, `fetch_failed`. */
	error?: string;
}

export interface StateDeleteMessage {
	type: typeof DELETE_MESSAGE_TYPE;
	requestId: string;
	key: string;
}

export interface StateDeleteResultMessage {
	type: typeof DELETE_RESULT_MESSAGE_TYPE;
	requestId: string;
	ok?: true;
	error?: string;
}

export function isStateGetResultMessage(
	value: unknown,
): value is StateGetResultMessage {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.type !== GET_RESULT_MESSAGE_TYPE) return false;
	if (typeof v.requestId !== "string") return false;
	return true;
}

export function isStateSetResultMessage(
	value: unknown,
): value is StateSetResultMessage {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.type !== SET_RESULT_MESSAGE_TYPE) return false;
	if (typeof v.requestId !== "string") return false;
	return true;
}

export function isStateDeleteResultMessage(
	value: unknown,
): value is StateDeleteResultMessage {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.type !== DELETE_RESULT_MESSAGE_TYPE) return false;
	if (typeof v.requestId !== "string") return false;
	return true;
}
