import { AppStateError, deleteState, getState, setState } from "../client";
import {
	DELETE_MESSAGE_TYPE,
	DELETE_RESULT_MESSAGE_TYPE,
	GET_MESSAGE_TYPE,
	GET_RESULT_MESSAGE_TYPE,
	SET_MESSAGE_TYPE,
	SET_RESULT_MESSAGE_TYPE,
} from "../protocol";

function buildIframeWindow() {
	const childListeners: Array<(ev: MessageEvent) => void> = [];
	const parentMessages: Array<{ data: unknown; targetOrigin: string }> = [];

	const parentWindow = {
		postMessage: (data: unknown, targetOrigin: string) => {
			parentMessages.push({ data, targetOrigin });
		},
	} as unknown as Window;

	const childWindow = {
		parent: parentWindow,
		addEventListener: (type: string, fn: EventListener) => {
			if (type === "message")
				childListeners.push(fn as (ev: MessageEvent) => void);
		},
		removeEventListener: (type: string, fn: EventListener) => {
			if (type !== "message") return;
			const i = childListeners.indexOf(fn as (ev: MessageEvent) => void);
			if (i >= 0) childListeners.splice(i, 1);
		},
	} as unknown as Window;

	const replyFromParent = (payload: unknown) => {
		const event = {
			data: payload,
			source: parentWindow,
			origin: "https://appstore.example",
		} as unknown as MessageEvent;
		for (const fn of [...childListeners]) fn(event);
	};

	const replyFromOther = (payload: unknown) => {
		const event = {
			data: payload,
			source: {} as Window,
			origin: "https://evil.example",
		} as unknown as MessageEvent;
		for (const fn of [...childListeners]) fn(event);
	};

	return {
		childWindow,
		parentMessages,
		replyFromParent,
		replyFromOther,
		listenerCount: () => childListeners.length,
	};
}

describe("getState", () => {
	it("posts a well-formed elata:state:get to the parent", async () => {
		const fx = buildIframeWindow();
		const promise = getState("save_1", { window: fx.childWindow });

		expect(fx.parentMessages).toHaveLength(1);
		const msg = fx.parentMessages[0].data as Record<string, unknown>;
		expect(msg.type).toBe(GET_MESSAGE_TYPE);
		expect(msg.key).toBe("save_1");
		expect(typeof msg.requestId).toBe("string");

		fx.replyFromParent({
			type: GET_RESULT_MESSAGE_TYPE,
			requestId: msg.requestId,
			value: null,
		});
		await promise;
	});

	it("resolves with the host-supplied value", async () => {
		const fx = buildIframeWindow();
		const promise = getState("save_1", { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;
		fx.replyFromParent({
			type: GET_RESULT_MESSAGE_TYPE,
			requestId,
			value: { level: 7 },
		});
		await expect(promise).resolves.toEqual({ level: 7 });
	});

	it("resolves with null when the host returns no value field", async () => {
		const fx = buildIframeWindow();
		const promise = getState("save_1", { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;
		fx.replyFromParent({ type: GET_RESULT_MESSAGE_TYPE, requestId });
		await expect(promise).resolves.toBeNull();
	});

	it("rejects with not_authenticated", async () => {
		const fx = buildIframeWindow();
		const promise = getState("save_1", { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;
		fx.replyFromParent({
			type: GET_RESULT_MESSAGE_TYPE,
			requestId,
			error: "not_authenticated",
		});
		await expect(promise).rejects.toMatchObject({
			name: "AppStateError",
			code: "not_authenticated",
		});
	});

	it("rejects synchronously when key is empty or too long", () => {
		const fx = buildIframeWindow();
		expect(() => getState("", { window: fx.childWindow })).toThrow(AppStateError);
		expect(() =>
			getState("x".repeat(257), { window: fx.childWindow }),
		).toThrow(AppStateError);
	});

	it("rejects with timeout when no result arrives", async () => {
		const fx = buildIframeWindow();
		const promise = getState("save_1", { window: fx.childWindow, timeoutMs: 10 });
		await expect(promise).rejects.toMatchObject({ code: "timeout" });
		expect(fx.listenerCount()).toBe(0);
	});

	it("ignores results from a non-parent source", async () => {
		const fx = buildIframeWindow();
		const promise = getState("save_1", { window: fx.childWindow, timeoutMs: 30 });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;
		fx.replyFromOther({
			type: GET_RESULT_MESSAGE_TYPE,
			requestId,
			value: "spoofed",
		});
		await expect(promise).rejects.toMatchObject({ code: "timeout" });
	});
});

describe("setState", () => {
	it("posts a well-formed elata:state:set including the value", async () => {
		const fx = buildIframeWindow();
		const promise = setState("save_1", { level: 8 }, { window: fx.childWindow });
		const msg = fx.parentMessages[0].data as Record<string, unknown>;
		expect(msg.type).toBe(SET_MESSAGE_TYPE);
		expect(msg.key).toBe("save_1");
		expect(msg.value).toEqual({ level: 8 });
		fx.replyFromParent({
			type: SET_RESULT_MESSAGE_TYPE,
			requestId: msg.requestId as string,
			ok: true,
		});
		await promise;
	});

	it("resolves void on success", async () => {
		const fx = buildIframeWindow();
		const promise = setState("save_1", 1, { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;
		fx.replyFromParent({ type: SET_RESULT_MESSAGE_TYPE, requestId, ok: true });
		await expect(promise).resolves.toBeUndefined();
	});

	it("rejects with value_too_large on host error", async () => {
		const fx = buildIframeWindow();
		const promise = setState("save_1", "x", { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;
		fx.replyFromParent({
			type: SET_RESULT_MESSAGE_TYPE,
			requestId,
			error: "value_too_large",
		});
		await expect(promise).rejects.toMatchObject({ code: "value_too_large" });
	});

	it("rejects synchronously when value is undefined", () => {
		const fx = buildIframeWindow();
		expect(() =>
			setState("save_1", undefined, { window: fx.childWindow }),
		).toThrow(AppStateError);
	});

	it("rejects synchronously when called outside an iframe", () => {
		const sameWindow = {} as Window;
		(sameWindow as { parent: Window }).parent = sameWindow;
		expect(() => setState("save_1", 1, { window: sameWindow })).toThrow(
			AppStateError,
		);
	});
});

describe("deleteState", () => {
	it("posts a well-formed elata:state:delete", async () => {
		const fx = buildIframeWindow();
		const promise = deleteState("save_1", { window: fx.childWindow });
		const msg = fx.parentMessages[0].data as Record<string, unknown>;
		expect(msg.type).toBe(DELETE_MESSAGE_TYPE);
		expect(msg.key).toBe("save_1");
		fx.replyFromParent({
			type: DELETE_RESULT_MESSAGE_TYPE,
			requestId: msg.requestId as string,
			ok: true,
		});
		await promise;
	});

	it("resolves void on success", async () => {
		const fx = buildIframeWindow();
		const promise = deleteState("save_1", { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;
		fx.replyFromParent({
			type: DELETE_RESULT_MESSAGE_TYPE,
			requestId,
			ok: true,
		});
		await expect(promise).resolves.toBeUndefined();
	});

	it("rejects with fetch_failed on unknown host error", async () => {
		const fx = buildIframeWindow();
		const promise = deleteState("save_1", { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;
		fx.replyFromParent({
			type: DELETE_RESULT_MESSAGE_TYPE,
			requestId,
			error: "anything_else",
		});
		await expect(promise).rejects.toMatchObject({ code: "fetch_failed" });
	});

	it("rejects with timeout when no result arrives", async () => {
		const fx = buildIframeWindow();
		const promise = deleteState("save_1", {
			window: fx.childWindow,
			timeoutMs: 10,
		});
		await expect(promise).rejects.toMatchObject({ code: "timeout" });
		expect(fx.listenerCount()).toBe(0);
	});
});
