/**
 * Handshake: the trusted host initiates by posting the one-shot init message
 * with a transferred `MessagePort`; the sandboxed client captures the port
 * exactly once. Mirrors the proven `__elata_metrics_init` shape while staying
 * a fully separate channel (raw biosignal surface is independent by design).
 *
 * Trust model: the init post targets the app frame with `targetOrigin: "*"`
 * at the call site — trust moves to the captured port, not the origin. The
 * client accepts only the first structurally valid init; later init messages
 * (duplicate or forged) are ignored because the listener is already gone.
 */

import { BiosignalClientError } from "./errors";
import {
	BIOSIGNAL_INIT_MESSAGE_KIND,
	BIOSIGNAL_LIMITS,
	BIOSIGNAL_PROTOCOL_VERSION,
	isBiosignalInitMessage,
} from "./messages";
import type { BiosignalInitMessage } from "./messages";

/**
 * How the host delivers the init message into the app frame. In production
 * this wraps `iframe.contentWindow.postMessage(message, "*", transfer)`;
 * injectable so hosts and tests control the delivery edge.
 */
export type InitPoster = (
	message: BiosignalInitMessage,
	transfer: Transferable[],
) => void;

export interface PostedHandshake {
	/** Host-side end of the channel — all protocol traffic flows here. */
	port1: MessagePort;
	/** The channel whose `port2` was transferred to the client. */
	channel: MessageChannel;
}

/**
 * Host side: build a dedicated channel, post the init message with `port2`
 * transferred, and keep `port1`.
 */
export function postBiosignalInit(
	post: InitPoster,
	channel: MessageChannel = new MessageChannel(),
): PostedHandshake {
	post({ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: BIOSIGNAL_PROTOCOL_VERSION }, [
		channel.port2,
	]);
	return { port1: channel.port1, channel };
}

/** A `window`-like target the client capture subscribes to. */
export interface HandshakeMessageTarget {
	addEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void;
	removeEventListener(
		type: "message",
		listener: (event: MessageEvent) => void,
	): void;
}

export interface CaptureInitPortOptions {
	/** Defaults to `window`; injectable for tests and workers. */
	target?: HandshakeMessageTarget;
	/** Defaults to the protocol handshake timeout; `Infinity` disables it. */
	timeoutMs?: number;
	setTimeoutFn?: (callback: () => void, ms: number) => unknown;
	clearTimeoutFn?: (handle: unknown) => void;
}

/**
 * Client side: capture the init port exactly once.
 *
 * - Non-init messages are ignored (the app window carries other traffic).
 * - A matching kind with a wrong version rejects with `protocol_mismatch`.
 * - An init without a transferred port is ignored (malformed / forged).
 * - After the first capture the listener is removed, so duplicate init
 *   messages can never steal the channel.
 * - Without a valid init within `timeoutMs`: rejects `handshake_timeout`.
 */
export function captureBiosignalInitPort(
	options: CaptureInitPortOptions = {},
): Promise<MessagePort> {
	const target =
		options.target ?? (globalThis as unknown as HandshakeMessageTarget);
	const timeoutMs = options.timeoutMs ?? BIOSIGNAL_LIMITS.handshakeTimeoutMs;
	const setTimeoutFn =
		options.setTimeoutFn ??
		((callback: () => void, ms: number) => setTimeout(callback, ms));
	const clearTimeoutFn =
		options.clearTimeoutFn ??
		((handle: unknown) =>
			clearTimeout(handle as ReturnType<typeof setTimeout>));

	return new Promise<MessagePort>((resolve, reject) => {
		let timer: unknown = null;
		let settled = false;

		const settle = (action: () => void) => {
			if (settled) return;
			settled = true;
			target.removeEventListener("message", onMessage);
			if (timer !== null) clearTimeoutFn(timer);
			action();
		};

		function onMessage(event: MessageEvent) {
			const data: unknown = event.data;
			if (typeof data !== "object" || data === null) return;
			const candidate = data as { kind?: unknown; v?: unknown };
			if (candidate.kind !== BIOSIGNAL_INIT_MESSAGE_KIND) return;
			if (!isBiosignalInitMessage(data)) {
				settle(() =>
					reject(
						new BiosignalClientError(
							"protocol_mismatch",
							`unsupported biosignal protocol version: ${String(candidate.v)}`,
						),
					),
				);
				return;
			}
			const port = event.ports?.[0];
			if (!port) return; // malformed init — keep waiting for a real one
			settle(() => resolve(port));
		}

		target.addEventListener("message", onMessage);
		if (Number.isFinite(timeoutMs)) {
			timer = setTimeoutFn(() => {
				settle(() =>
					reject(
						new BiosignalClientError(
							"handshake_timeout",
							`no biosignal init received within ${timeoutMs} ms`,
						),
					),
				);
			}, timeoutMs);
		}
	});
}
