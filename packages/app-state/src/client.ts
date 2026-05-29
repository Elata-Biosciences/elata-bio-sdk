/**
 * Per-user, per-app key-value storage for sandboxed apps. Three methods:
 * `getState`, `setState`, `deleteState`. Each generates a `requestId`,
 * posts to `window.parent`, awaits a matching `:result` message, and
 * resolves.
 *
 * The host owns the database row scope and the session — this client never
 * sees the user's identity. Mirrors the postMessage round-trip / promise /
 * timeout pattern of `@elata-biosciences/app-payments`.
 */

import {
	DELETE_MESSAGE_TYPE,
	GET_MESSAGE_TYPE,
	KEY_MAX_LENGTH,
	REQUEST_ID_MAX_LENGTH,
	REQUEST_ID_MIN_LENGTH,
	SET_MESSAGE_TYPE,
	type StateDeleteMessage,
	type StateGetMessage,
	type StateSetMessage,
	isStateDeleteResultMessage,
	isStateGetResultMessage,
	isStateSetResultMessage,
} from "./protocol";

export type AppStateErrorCode =
	| "no_window"
	| "no_parent"
	| "invalid_input"
	| "timeout"
	| "no_crypto"
	| "not_authenticated"
	| "value_too_large"
	| "not_found"
	| "fetch_failed";

export class AppStateError extends Error {
	readonly code: AppStateErrorCode;
	constructor(code: AppStateErrorCode, message: string) {
		super(message);
		this.name = "AppStateError";
		this.code = code;
	}
}

export interface StateOptions {
	/** Default 10 seconds. Pass `Infinity` to wait forever. */
	timeoutMs?: number;
	/** Optional override for testing. Defaults to the global `window`. */
	window?: Window;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function generateRequestId(): string {
	const c = globalThis.crypto;
	if (!c || typeof c.randomUUID !== "function") {
		throw new AppStateError(
			"no_crypto",
			"crypto.randomUUID not available in this environment",
		);
	}
	const id = c.randomUUID();
	if (id.length < REQUEST_ID_MIN_LENGTH || id.length > REQUEST_ID_MAX_LENGTH) {
		throw new AppStateError(
			"invalid_input",
			`generated requestId outside host bounds [${REQUEST_ID_MIN_LENGTH}, ${REQUEST_ID_MAX_LENGTH}]`,
		);
	}
	return id;
}

function resolveParent(targetWindow: Window | undefined): {
	targetWindow: Window;
	parent: Window;
} {
	const tw = targetWindow ?? globalThis.window;
	if (!tw) {
		throw new AppStateError(
			"no_window",
			"no window available (call state methods in a browser context)",
		);
	}
	const parent = tw.parent;
	if (!parent || parent === tw) {
		throw new AppStateError(
			"no_parent",
			"state methods must run inside an iframe with an appstore parent",
		);
	}
	return { targetWindow: tw, parent };
}

function validateKey(key: unknown): asserts key is string {
	if (
		typeof key !== "string" ||
		key.length === 0 ||
		key.length > KEY_MAX_LENGTH
	) {
		throw new AppStateError(
			"invalid_input",
			`key must be a non-empty string of at most ${KEY_MAX_LENGTH} characters`,
		);
	}
}

function mapErrorCode(raw: string | undefined): AppStateErrorCode {
	switch (raw) {
		case "not_authenticated":
			return "not_authenticated";
		case "invalid_input":
			return "invalid_input";
		case "value_too_large":
			return "value_too_large";
		case "not_found":
			return "not_found";
		default:
			return "fetch_failed";
	}
}

/**
 * Read the value stored under `key` for the current session user. Resolves
 * with `null` if no value is set, the parsed JSON value otherwise.
 *
 * Throws `AppStateError` on local failures (`no_parent`, `timeout`,
 * `invalid_input`) and host-reported errors (`not_authenticated`,
 * `fetch_failed`).
 *
 * @example
 *   const save = await getState("save_slot_1") as SaveGame | null;
 */
export function getState(
	key: string,
	opts: StateOptions = {},
): Promise<unknown> {
	validateKey(key);
	if (opts.timeoutMs !== undefined && typeof opts.timeoutMs !== "number") {
		throw new AppStateError("invalid_input", "timeoutMs must be a number");
	}
	const { targetWindow, parent } = resolveParent(opts.window);
	const requestId = generateRequestId();
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const message: StateGetMessage = {
		type: GET_MESSAGE_TYPE,
		requestId,
		key,
	};

	return new Promise<unknown>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const cleanup = () => {
			targetWindow.removeEventListener("message", onMessage);
			if (timer !== null) clearTimeout(timer);
		};
		const settle = (value: unknown) => {
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
			if (!isStateGetResultMessage(ev.data)) return;
			if (ev.data.requestId !== requestId) return;
			if (typeof ev.data.error === "string") {
				fail(new AppStateError(mapErrorCode(ev.data.error), ev.data.error));
				return;
			}
			settle(ev.data.value ?? null);
		};
		targetWindow.addEventListener("message", onMessage);
		if (timeoutMs !== Number.POSITIVE_INFINITY) {
			timer = setTimeout(() => {
				fail(
					new AppStateError(
						"timeout",
						`no getState result within ${timeoutMs}ms`,
					),
				);
			}, timeoutMs);
		}
		try {
			parent.postMessage(message, "*");
		} catch (e) {
			fail(
				new AppStateError(
					"invalid_input",
					e instanceof Error ? e.message : "postMessage failed",
				),
			);
		}
	});
}

/**
 * Upsert `value` (any JSON-serializable type) under `key` for the current
 * session user. The host caps the encoded value at 64 KB.
 *
 * @example
 *   await setState("save_slot_1", { level: 7, hp: 100 });
 */
export function setState(
	key: string,
	value: unknown,
	opts: StateOptions = {},
): Promise<void> {
	validateKey(key);
	if (opts.timeoutMs !== undefined && typeof opts.timeoutMs !== "number") {
		throw new AppStateError("invalid_input", "timeoutMs must be a number");
	}
	if (typeof value === "function" || typeof value === "undefined") {
		throw new AppStateError(
			"invalid_input",
			"value must be JSON-serializable (not undefined or a function)",
		);
	}
	const { targetWindow, parent } = resolveParent(opts.window);
	const requestId = generateRequestId();
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const message: StateSetMessage = {
		type: SET_MESSAGE_TYPE,
		requestId,
		key,
		value,
	};

	return new Promise<void>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const cleanup = () => {
			targetWindow.removeEventListener("message", onMessage);
			if (timer !== null) clearTimeout(timer);
		};
		const settle = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve();
		};
		const fail = (err: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(err);
		};
		const onMessage = (ev: MessageEvent<unknown>) => {
			if (ev.source !== parent) return;
			if (!isStateSetResultMessage(ev.data)) return;
			if (ev.data.requestId !== requestId) return;
			if (typeof ev.data.error === "string") {
				fail(new AppStateError(mapErrorCode(ev.data.error), ev.data.error));
				return;
			}
			settle();
		};
		targetWindow.addEventListener("message", onMessage);
		if (timeoutMs !== Number.POSITIVE_INFINITY) {
			timer = setTimeout(() => {
				fail(
					new AppStateError(
						"timeout",
						`no setState result within ${timeoutMs}ms`,
					),
				);
			}, timeoutMs);
		}
		try {
			parent.postMessage(message, "*");
		} catch (e) {
			fail(
				new AppStateError(
					"invalid_input",
					e instanceof Error ? e.message : "postMessage failed",
				),
			);
		}
	});
}

/**
 * Remove the value stored under `key`. Idempotent — resolves successfully
 * even if no value was set.
 *
 * @example
 *   await deleteState("save_slot_1");
 */
export function deleteState(
	key: string,
	opts: StateOptions = {},
): Promise<void> {
	validateKey(key);
	if (opts.timeoutMs !== undefined && typeof opts.timeoutMs !== "number") {
		throw new AppStateError("invalid_input", "timeoutMs must be a number");
	}
	const { targetWindow, parent } = resolveParent(opts.window);
	const requestId = generateRequestId();
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	const message: StateDeleteMessage = {
		type: DELETE_MESSAGE_TYPE,
		requestId,
		key,
	};

	return new Promise<void>((resolve, reject) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const cleanup = () => {
			targetWindow.removeEventListener("message", onMessage);
			if (timer !== null) clearTimeout(timer);
		};
		const settle = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve();
		};
		const fail = (err: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(err);
		};
		const onMessage = (ev: MessageEvent<unknown>) => {
			if (ev.source !== parent) return;
			if (!isStateDeleteResultMessage(ev.data)) return;
			if (ev.data.requestId !== requestId) return;
			if (typeof ev.data.error === "string") {
				fail(new AppStateError(mapErrorCode(ev.data.error), ev.data.error));
				return;
			}
			settle();
		};
		targetWindow.addEventListener("message", onMessage);
		if (timeoutMs !== Number.POSITIVE_INFINITY) {
			timer = setTimeout(() => {
				fail(
					new AppStateError(
						"timeout",
						`no deleteState result within ${timeoutMs}ms`,
					),
				);
			}, timeoutMs);
		}
		try {
			parent.postMessage(message, "*");
		} catch (e) {
			fail(
				new AppStateError(
					"invalid_input",
					e instanceof Error ? e.message : "postMessage failed",
				),
			);
		}
	});
}
