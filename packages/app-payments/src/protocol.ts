/**
 * Wire protocol between the sandboxed app (client) and the appstore host.
 *
 * One-shot request/response over `window.parent.postMessage`. The app sends an
 * `elata:iap:request`; the parent renders a payment modal outside the iframe
 * and replies with an `elata:iap:result` matching on `requestId`.
 *
 * The host (PlayHeader) validates `event.origin === embedOrigin` before
 * accepting a request. The app sends with target origin `"*"` because it does
 * not know its parent's origin; the host-side origin check is what matters.
 */

export const PROTOCOL_VERSION = 1 as const;
export const REQUEST_MESSAGE_TYPE = "elata:iap:request" as const;
export const RESULT_MESSAGE_TYPE = "elata:iap:result" as const;

/** Host-enforced bounds on `requestId` length. Mirror these on the client. */
export const REQUEST_ID_MIN_LENGTH = 8;
export const REQUEST_ID_MAX_LENGTH = 128;

export interface IapRequestMessage {
	type: typeof REQUEST_MESSAGE_TYPE;
	requestId: string;
	contentId: number;
	/** Display hint only — the host refetches the authoritative price. */
	priceUsdc?: string;
	title?: string;
	description?: string;
}

export type IapStatus = "success" | "cancelled" | "error";

export interface IapResultMessage {
	type: typeof RESULT_MESSAGE_TYPE;
	requestId: string;
	status: IapStatus;
	txHash?: string;
	error?: string;
}

export function isIapResultMessage(value: unknown): value is IapResultMessage {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.type !== RESULT_MESSAGE_TYPE) return false;
	if (typeof v.requestId !== "string") return false;
	if (
		v.status !== "success" &&
		v.status !== "cancelled" &&
		v.status !== "error"
	) {
		return false;
	}
	return true;
}
