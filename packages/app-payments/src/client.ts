/**
 * Client API for sandboxed apps to request an in-app purchase from the
 * appstore host. Single async function — generates a requestId, posts the
 * request to `window.parent`, waits for the matching result, and resolves.
 *
 * The host owns the payment UI (wallet, PayEmbed, on-chain tx). This client
 * just declares intent and awaits the outcome.
 */

import {
	HAS_ITEM_MESSAGE_TYPE,
	type IapHasItemMessage,
	type IapListOwnedMessage,
	type IapRequestMessage,
	type IapStatus,
	LIST_OWNED_MESSAGE_TYPE,
	REQUEST_ID_MAX_LENGTH,
	REQUEST_ID_MIN_LENGTH,
	REQUEST_MESSAGE_TYPE,
	isIapHasItemResultMessage,
	isIapListOwnedResultMessage,
	isIapResultMessage,
} from "./protocol";

export type { IapStatus } from "./protocol";

export interface RequestPurchaseInput {
	/** Integer `contentId` issued by the host when the listing was created. */
	contentId: number;
	/** Optional display hint shown while the modal loads. Host is authoritative. */
	priceUsdc?: string;
	/** Optional display title. Host overrides from listing metadata when present. */
	title?: string;
	/** Optional display description. */
	description?: string;
	/** Default 5 minutes. Pass `Infinity` to wait forever. */
	timeoutMs?: number;
	/** Optional override for testing. Defaults to the global `window`. */
	window?: Window;
}

export interface PurchaseSuccess {
	status: "success";
	requestId: string;
	txHash: string;
}

export interface PurchaseCancelled {
	status: "cancelled";
	requestId: string;
}

export interface PurchaseError {
	status: "error";
	requestId: string;
	error: string;
}

export type PurchaseResult =
	| PurchaseSuccess
	| PurchaseCancelled
	| PurchaseError;

export type AppPaymentsErrorCode =
	| "no_window"
	| "no_parent"
	| "invalid_input"
	| "timeout"
	| "no_crypto"
	| "not_authenticated"
	| "fetch_failed";

export class AppPaymentsError extends Error {
	readonly code: AppPaymentsErrorCode;
	constructor(code: AppPaymentsErrorCode, message: string) {
		super(message);
		this.name = "AppPaymentsError";
		this.code = code;
	}
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

function generateRequestId(): string {
	const c = globalThis.crypto;
	if (!c || typeof c.randomUUID !== "function") {
		throw new AppPaymentsError(
			"no_crypto",
			"crypto.randomUUID not available in this environment",
		);
	}
	return c.randomUUID();
}

function validateInput(input: RequestPurchaseInput): void {
	if (
		typeof input.contentId !== "number" ||
		!Number.isInteger(input.contentId) ||
		input.contentId < 0
	) {
		throw new AppPaymentsError(
			"invalid_input",
			"contentId must be a non-negative integer",
		);
	}
	if (input.priceUsdc !== undefined && typeof input.priceUsdc !== "string") {
		throw new AppPaymentsError("invalid_input", "priceUsdc must be a string");
	}
	if (input.title !== undefined && typeof input.title !== "string") {
		throw new AppPaymentsError("invalid_input", "title must be a string");
	}
	if (
		input.description !== undefined &&
		typeof input.description !== "string"
	) {
		throw new AppPaymentsError("invalid_input", "description must be a string");
	}
}

/**
 * Request an in-app purchase. Resolves with the host's verdict.
 *
 * The promise never rejects on a normal `cancelled` or `error` outcome — those
 * are returned as `PurchaseResult`. It only rejects on local failures: invalid
 * input, missing browser APIs, or timeout.
 *
 * @example
 *   const result = await requestPurchase({ contentId: 7, priceUsdc: "0.01", title: "Chicken" });
 *   if (result.status === "success") unlockNextLevel();
 */
export function requestPurchase(
	input: RequestPurchaseInput,
): Promise<PurchaseResult> {
	validateInput(input);

	const targetWindow = input.window ?? globalThis.window;
	if (!targetWindow) {
		throw new AppPaymentsError(
			"no_window",
			"no window available (call requestPurchase in a browser context)",
		);
	}
	const parent = targetWindow.parent;
	if (!parent || parent === targetWindow) {
		throw new AppPaymentsError(
			"no_parent",
			"requestPurchase must run inside an iframe with an appstore parent",
		);
	}

	const requestId = generateRequestId();
	// Defensive: crypto.randomUUID is 36 chars — well within host bounds.
	// Re-checking guards against future ID schemes drifting out of range.
	if (
		requestId.length < REQUEST_ID_MIN_LENGTH ||
		requestId.length > REQUEST_ID_MAX_LENGTH
	) {
		throw new AppPaymentsError(
			"invalid_input",
			`generated requestId outside host bounds [${REQUEST_ID_MIN_LENGTH}, ${REQUEST_ID_MAX_LENGTH}]`,
		);
	}

	const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const message: IapRequestMessage = {
		type: REQUEST_MESSAGE_TYPE,
		requestId,
		contentId: input.contentId,
	};
	if (input.priceUsdc !== undefined) message.priceUsdc = input.priceUsdc;
	if (input.title !== undefined) message.title = input.title;
	if (input.description !== undefined) message.description = input.description;

	return new Promise<PurchaseResult>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			targetWindow.removeEventListener("message", onMessage);
			if (timer !== null) clearTimeout(timer);
		};

		const settle = (result: PurchaseResult) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(result);
		};

		const fail = (err: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(err);
		};

		const onMessage = (ev: MessageEvent<unknown>) => {
			// Only accept messages from our parent window. The iframe cannot be
			// addressed by anything other than the parent (and itself), but this
			// is a cheap belt-and-suspenders check.
			if (ev.source !== parent) return;
			if (!isIapResultMessage(ev.data)) return;
			if (ev.data.requestId !== requestId) return;

			const status: IapStatus = ev.data.status;
			if (status === "success") {
				settle({
					status: "success",
					requestId,
					txHash: typeof ev.data.txHash === "string" ? ev.data.txHash : "",
				});
				return;
			}
			if (status === "cancelled") {
				settle({ status: "cancelled", requestId });
				return;
			}
			settle({
				status: "error",
				requestId,
				error:
					typeof ev.data.error === "string" ? ev.data.error : "unknown error",
			});
		};

		targetWindow.addEventListener("message", onMessage);

		if (timeoutMs !== Number.POSITIVE_INFINITY) {
			timer = setTimeout(() => {
				fail(
					new AppPaymentsError(
						"timeout",
						`no purchase result within ${timeoutMs}ms`,
					),
				);
			}, timeoutMs);
		}

		try {
			parent.postMessage(message, "*");
		} catch (e) {
			fail(
				new AppPaymentsError(
					"invalid_input",
					e instanceof Error ? e.message : "postMessage failed",
				),
			);
		}
	});
}

export interface EntitlementQueryInput {
	/** Default 10 seconds. Pass `Infinity` to wait forever. */
	timeoutMs?: number;
	/** Optional override for testing. Defaults to the global `window`. */
	window?: Window;
}

const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

function resolveParent(targetWindow: Window | undefined): {
	targetWindow: Window;
	parent: Window;
} {
	const tw = targetWindow ?? globalThis.window;
	if (!tw) {
		throw new AppPaymentsError(
			"no_window",
			"no window available (call entitlement queries in a browser context)",
		);
	}
	const parent = tw.parent;
	if (!parent || parent === tw) {
		throw new AppPaymentsError(
			"no_parent",
			"entitlement queries must run inside an iframe with an appstore parent",
		);
	}
	return { targetWindow: tw, parent };
}

function generateQueryRequestId(): string {
	const requestId = generateRequestId();
	if (
		requestId.length < REQUEST_ID_MIN_LENGTH ||
		requestId.length > REQUEST_ID_MAX_LENGTH
	) {
		throw new AppPaymentsError(
			"invalid_input",
			`generated requestId outside host bounds [${REQUEST_ID_MIN_LENGTH}, ${REQUEST_ID_MAX_LENGTH}]`,
		);
	}
	return requestId;
}

/**
 * Ask the appstore host whether the session user owns a given offchain item.
 *
 * Resolves with `true` / `false` on a clean answer. Throws `AppPaymentsError`
 * on local failures (`no_parent`, `timeout`, `invalid_input`) or host
 * failures (`not_authenticated`, `fetch_failed`).
 *
 * @example
 *   if (await hasItem(7)) unlockPermanentSkin();
 */
export function hasItem(
	contentId: number,
	opts: EntitlementQueryInput = {},
): Promise<boolean> {
	if (
		typeof contentId !== "number" ||
		!Number.isInteger(contentId) ||
		contentId < 0
	) {
		throw new AppPaymentsError(
			"invalid_input",
			"contentId must be a non-negative integer",
		);
	}
	if (opts.timeoutMs !== undefined && typeof opts.timeoutMs !== "number") {
		throw new AppPaymentsError("invalid_input", "timeoutMs must be a number");
	}

	const { targetWindow, parent } = resolveParent(opts.window);
	const requestId = generateQueryRequestId();
	const timeoutMs = opts.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

	const message: IapHasItemMessage = {
		type: HAS_ITEM_MESSAGE_TYPE,
		requestId,
		contentId,
	};

	return new Promise<boolean>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			targetWindow.removeEventListener("message", onMessage);
			if (timer !== null) clearTimeout(timer);
		};
		const settle = (value: boolean) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(value);
		};
		const fail = (err: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(err);
		};

		const onMessage = (ev: MessageEvent<unknown>) => {
			if (ev.source !== parent) return;
			if (!isIapHasItemResultMessage(ev.data)) return;
			if (ev.data.requestId !== requestId) return;
			if (typeof ev.data.error === "string") {
				const code: AppPaymentsErrorCode =
					ev.data.error === "not_authenticated"
						? "not_authenticated"
						: "fetch_failed";
				fail(new AppPaymentsError(code, ev.data.error));
				return;
			}
			settle(ev.data.owned === true);
		};

		targetWindow.addEventListener("message", onMessage);

		if (timeoutMs !== Number.POSITIVE_INFINITY) {
			timer = setTimeout(() => {
				fail(
					new AppPaymentsError(
						"timeout",
						`no hasItem result within ${timeoutMs}ms`,
					),
				);
			}, timeoutMs);
		}

		try {
			parent.postMessage(message, "*");
		} catch (e) {
			fail(
				new AppPaymentsError(
					"invalid_input",
					e instanceof Error ? e.message : "postMessage failed",
				),
			);
		}
	});
}

/**
 * List every offchain `contentId` the session user owns for this app.
 *
 * Resolves with a sorted ascending array (possibly empty). Same error model
 * as `hasItem`.
 *
 * @example
 *   const owned = await getOwnedItems();
 *   owned.forEach(restoreItem);
 */
export function getOwnedItems(
	opts: EntitlementQueryInput = {},
): Promise<number[]> {
	if (opts.timeoutMs !== undefined && typeof opts.timeoutMs !== "number") {
		throw new AppPaymentsError("invalid_input", "timeoutMs must be a number");
	}

	const { targetWindow, parent } = resolveParent(opts.window);
	const requestId = generateQueryRequestId();
	const timeoutMs = opts.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;

	const message: IapListOwnedMessage = {
		type: LIST_OWNED_MESSAGE_TYPE,
		requestId,
	};

	return new Promise<number[]>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			targetWindow.removeEventListener("message", onMessage);
			if (timer !== null) clearTimeout(timer);
		};
		const settle = (value: number[]) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(value);
		};
		const fail = (err: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(err);
		};

		const onMessage = (ev: MessageEvent<unknown>) => {
			if (ev.source !== parent) return;
			if (!isIapListOwnedResultMessage(ev.data)) return;
			if (ev.data.requestId !== requestId) return;
			if (typeof ev.data.error === "string") {
				const code: AppPaymentsErrorCode =
					ev.data.error === "not_authenticated"
						? "not_authenticated"
						: "fetch_failed";
				fail(new AppPaymentsError(code, ev.data.error));
				return;
			}
			const ids = Array.isArray(ev.data.ownedContentIds)
				? ev.data.ownedContentIds.filter(
						(id): id is number =>
							typeof id === "number" && Number.isInteger(id),
					)
				: [];
			settle(ids);
		};

		targetWindow.addEventListener("message", onMessage);

		if (timeoutMs !== Number.POSITIVE_INFINITY) {
			timer = setTimeout(() => {
				fail(
					new AppPaymentsError(
						"timeout",
						`no getOwnedItems result within ${timeoutMs}ms`,
					),
				);
			}, timeoutMs);
		}

		try {
			parent.postMessage(message, "*");
		} catch (e) {
			fail(
				new AppPaymentsError(
					"invalid_input",
					e instanceof Error ? e.message : "postMessage failed",
				),
			);
		}
	});
}
