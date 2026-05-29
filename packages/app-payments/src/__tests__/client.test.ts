import {
	AppPaymentsError,
	getCatalog,
	getOwnedItems,
	hasItem,
	requestPurchase,
} from "../client";
import {
	GET_CATALOG_MESSAGE_TYPE,
	GET_CATALOG_RESULT_MESSAGE_TYPE,
	HAS_ITEM_MESSAGE_TYPE,
	HAS_ITEM_RESULT_MESSAGE_TYPE,
	LIST_OWNED_MESSAGE_TYPE,
	LIST_OWNED_RESULT_MESSAGE_TYPE,
	REQUEST_MESSAGE_TYPE,
	RESULT_MESSAGE_TYPE,
} from "../protocol";

/**
 * Build a fake iframe window that has a distinct parent window. The parent
 * captures posted messages and exposes a `reply` helper that dispatches a
 * `MessageEvent` back to the child with `source === parent`.
 */
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

describe("requestPurchase", () => {
	it("posts a well-formed elata:iap:request to the parent window", async () => {
		const fx = buildIframeWindow();

		const promise = requestPurchase({
			contentId: 7,
			priceUsdc: "0.01",
			title: "Chicken",
			description: "Unlocks next level",
			window: fx.childWindow,
		});

		expect(fx.parentMessages).toHaveLength(1);
		const { data, targetOrigin } = fx.parentMessages[0];
		expect(targetOrigin).toBe("*");
		const msg = data as Record<string, unknown>;
		expect(msg.type).toBe(REQUEST_MESSAGE_TYPE);
		expect(typeof msg.requestId).toBe("string");
		expect((msg.requestId as string).length).toBeGreaterThanOrEqual(8);
		expect(msg.contentId).toBe(7);
		expect(msg.priceUsdc).toBe("0.01");
		expect(msg.title).toBe("Chicken");
		expect(msg.description).toBe("Unlocks next level");

		// Resolve the promise so the test doesn't leak.
		fx.replyFromParent({
			type: RESULT_MESSAGE_TYPE,
			requestId: msg.requestId,
			status: "success",
			txHash: "0xabc",
		});
		await promise;
	});

	it("resolves with success + txHash when the parent replies success", async () => {
		const fx = buildIframeWindow();
		const promise = requestPurchase({ contentId: 1, window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: RESULT_MESSAGE_TYPE,
			requestId,
			status: "success",
			txHash: "0xdeadbeef",
		});

		const result = await promise;
		expect(result).toEqual({
			status: "success",
			requestId,
			txHash: "0xdeadbeef",
		});
		expect(fx.listenerCount()).toBe(0);
	});

	it("resolves with cancelled when the parent replies cancelled", async () => {
		const fx = buildIframeWindow();
		const promise = requestPurchase({ contentId: 1, window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: RESULT_MESSAGE_TYPE,
			requestId,
			status: "cancelled",
		});

		const result = await promise;
		expect(result).toEqual({ status: "cancelled", requestId });
	});

	it("resolves with error + message when the parent replies error", async () => {
		const fx = buildIframeWindow();
		const promise = requestPurchase({ contentId: 1, window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: RESULT_MESSAGE_TYPE,
			requestId,
			status: "error",
			error: "insufficient_funds",
		});

		const result = await promise;
		expect(result).toEqual({
			status: "error",
			requestId,
			error: "insufficient_funds",
		});
	});

	it("ignores result messages from a non-parent source", async () => {
		const fx = buildIframeWindow();
		const promise = requestPurchase({
			contentId: 1,
			window: fx.childWindow,
			timeoutMs: 50,
		});
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		// Spoofed message from a different source — must be ignored.
		fx.replyFromOther({
			type: RESULT_MESSAGE_TYPE,
			requestId,
			status: "success",
			txHash: "0xspoof",
		});

		await expect(promise).rejects.toThrow(AppPaymentsError);
	});

	it("ignores result messages with a mismatched requestId", async () => {
		const fx = buildIframeWindow();
		const promise = requestPurchase({
			contentId: 1,
			window: fx.childWindow,
			timeoutMs: 50,
		});

		fx.replyFromParent({
			type: RESULT_MESSAGE_TYPE,
			requestId: "some-other-id",
			status: "success",
			txHash: "0x",
		});

		await expect(promise).rejects.toThrow(AppPaymentsError);
	});

	it("rejects with timeout when no result arrives in time", async () => {
		const fx = buildIframeWindow();
		const promise = requestPurchase({
			contentId: 1,
			window: fx.childWindow,
			timeoutMs: 10,
		});

		await expect(promise).rejects.toMatchObject({
			name: "AppPaymentsError",
			code: "timeout",
		});
		expect(fx.listenerCount()).toBe(0);
	});

	it("rejects synchronously when contentId is not a non-negative integer", () => {
		const fx = buildIframeWindow();
		expect(() =>
			requestPurchase({ contentId: -1, window: fx.childWindow }),
		).toThrow(AppPaymentsError);
		expect(() =>
			requestPurchase({ contentId: 1.5, window: fx.childWindow }),
		).toThrow(AppPaymentsError);
		expect(() =>
			requestPurchase({
				contentId: "1" as unknown as number,
				window: fx.childWindow,
			}),
		).toThrow(AppPaymentsError);
	});

	it("rejects when called outside an iframe (parent === self)", () => {
		const sameWindow = {} as Window;
		(sameWindow as { parent: Window }).parent = sameWindow;
		expect(() =>
			requestPurchase({ contentId: 1, window: sameWindow }),
		).toThrow(AppPaymentsError);
	});

	it("does not send a second response after the first one settles", async () => {
		const fx = buildIframeWindow();
		const promise = requestPurchase({ contentId: 1, window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: RESULT_MESSAGE_TYPE,
			requestId,
			status: "success",
			txHash: "0x1",
		});
		// A duplicate from a buggy host must not flip the result.
		fx.replyFromParent({
			type: RESULT_MESSAGE_TYPE,
			requestId,
			status: "cancelled",
		});

		const result = await promise;
		expect(result.status).toBe("success");
	});
});

describe("hasItem", () => {
	it("posts a well-formed elata:iap:hasItem message to the parent", async () => {
		const fx = buildIframeWindow();
		const promise = hasItem(7, { window: fx.childWindow });

		expect(fx.parentMessages).toHaveLength(1);
		const { data, targetOrigin } = fx.parentMessages[0];
		expect(targetOrigin).toBe("*");
		const msg = data as Record<string, unknown>;
		expect(msg.type).toBe(HAS_ITEM_MESSAGE_TYPE);
		expect(typeof msg.requestId).toBe("string");
		expect(msg.contentId).toBe(7);

		fx.replyFromParent({
			type: HAS_ITEM_RESULT_MESSAGE_TYPE,
			requestId: msg.requestId,
			owned: true,
		});
		await promise;
	});

	it("resolves true when the parent reports the item is owned", async () => {
		const fx = buildIframeWindow();
		const promise = hasItem(3, { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: HAS_ITEM_RESULT_MESSAGE_TYPE,
			requestId,
			owned: true,
		});

		await expect(promise).resolves.toBe(true);
		expect(fx.listenerCount()).toBe(0);
	});

	it("resolves false when the parent reports the item is not owned", async () => {
		const fx = buildIframeWindow();
		const promise = hasItem(3, { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: HAS_ITEM_RESULT_MESSAGE_TYPE,
			requestId,
			owned: false,
		});

		await expect(promise).resolves.toBe(false);
	});

	it("rejects with not_authenticated when the parent reports that error", async () => {
		const fx = buildIframeWindow();
		const promise = hasItem(3, { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: HAS_ITEM_RESULT_MESSAGE_TYPE,
			requestId,
			error: "not_authenticated",
		});

		await expect(promise).rejects.toMatchObject({
			name: "AppPaymentsError",
			code: "not_authenticated",
		});
	});

	it("rejects with fetch_failed for other host errors", async () => {
		const fx = buildIframeWindow();
		const promise = hasItem(3, { window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: HAS_ITEM_RESULT_MESSAGE_TYPE,
			requestId,
			error: "anything_else",
		});

		await expect(promise).rejects.toMatchObject({ code: "fetch_failed" });
	});

	it("ignores results from a non-parent source", async () => {
		const fx = buildIframeWindow();
		const promise = hasItem(3, { window: fx.childWindow, timeoutMs: 50 });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromOther({
			type: HAS_ITEM_RESULT_MESSAGE_TYPE,
			requestId,
			owned: true,
		});

		await expect(promise).rejects.toMatchObject({ code: "timeout" });
	});

	it("rejects synchronously when contentId is invalid", () => {
		const fx = buildIframeWindow();
		expect(() => hasItem(-1, { window: fx.childWindow })).toThrow(
			AppPaymentsError,
		);
		expect(() => hasItem(1.5, { window: fx.childWindow })).toThrow(
			AppPaymentsError,
		);
	});
});

describe("getOwnedItems", () => {
	it("posts a well-formed elata:iap:listOwned message to the parent", async () => {
		const fx = buildIframeWindow();
		const promise = getOwnedItems({ window: fx.childWindow });

		expect(fx.parentMessages).toHaveLength(1);
		const msg = fx.parentMessages[0].data as Record<string, unknown>;
		expect(msg.type).toBe(LIST_OWNED_MESSAGE_TYPE);
		expect(typeof msg.requestId).toBe("string");
		expect("contentId" in msg).toBe(false);

		fx.replyFromParent({
			type: LIST_OWNED_RESULT_MESSAGE_TYPE,
			requestId: msg.requestId,
			ownedContentIds: [],
		});
		await promise;
	});

	it("resolves with the parent-supplied array of contentIds", async () => {
		const fx = buildIframeWindow();
		const promise = getOwnedItems({ window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: LIST_OWNED_RESULT_MESSAGE_TYPE,
			requestId,
			ownedContentIds: [2, 5, 9],
		});

		await expect(promise).resolves.toEqual([2, 5, 9]);
	});

	it("filters non-integer entries out of ownedContentIds", async () => {
		const fx = buildIframeWindow();
		const promise = getOwnedItems({ window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: LIST_OWNED_RESULT_MESSAGE_TYPE,
			requestId,
			ownedContentIds: [1, "two", 3.5, 4],
		});

		await expect(promise).resolves.toEqual([1, 4]);
	});

	it("rejects with timeout when no result arrives in time", async () => {
		const fx = buildIframeWindow();
		const promise = getOwnedItems({ window: fx.childWindow, timeoutMs: 10 });
		await expect(promise).rejects.toMatchObject({ code: "timeout" });
		expect(fx.listenerCount()).toBe(0);
	});

	it("rejects with fetch_failed on host error", async () => {
		const fx = buildIframeWindow();
		const promise = getOwnedItems({ window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: LIST_OWNED_RESULT_MESSAGE_TYPE,
			requestId,
			error: "boom",
		});

		await expect(promise).rejects.toMatchObject({ code: "fetch_failed" });
	});
});

describe("getCatalog", () => {
	it("posts a well-formed elata:iap:getCatalog message to the parent", async () => {
		const fx = buildIframeWindow();
		const promise = getCatalog({ window: fx.childWindow });

		expect(fx.parentMessages).toHaveLength(1);
		const msg = fx.parentMessages[0].data as Record<string, unknown>;
		expect(msg.type).toBe(GET_CATALOG_MESSAGE_TYPE);
		expect(typeof msg.requestId).toBe("string");

		fx.replyFromParent({
			type: GET_CATALOG_RESULT_MESSAGE_TYPE,
			requestId: msg.requestId,
			items: [],
		});
		await promise;
	});

	it("resolves with the parent-supplied items array", async () => {
		const fx = buildIframeWindow();
		const promise = getCatalog({ window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		const items = [
			{ contentId: 0, title: "Hint pack", priceUsdc: "50000" },
			{
				contentId: 1,
				title: "Skin",
				priceUsdc: "1000000",
				imageUrl: "https://example/x.png",
			},
		];
		fx.replyFromParent({
			type: GET_CATALOG_RESULT_MESSAGE_TYPE,
			requestId,
			items,
		});

		await expect(promise).resolves.toEqual(items);
	});

	it("resolves with an empty array when items is missing or non-array", async () => {
		const fx = buildIframeWindow();
		const promise = getCatalog({ window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: GET_CATALOG_RESULT_MESSAGE_TYPE,
			requestId,
			items: "not-an-array",
		});

		await expect(promise).resolves.toEqual([]);
	});

	it("rejects with fetch_failed on host error", async () => {
		const fx = buildIframeWindow();
		const promise = getCatalog({ window: fx.childWindow });
		const requestId = (fx.parentMessages[0].data as { requestId: string })
			.requestId;

		fx.replyFromParent({
			type: GET_CATALOG_RESULT_MESSAGE_TYPE,
			requestId,
			error: "app_not_found",
		});

		await expect(promise).rejects.toMatchObject({ code: "fetch_failed" });
	});

	it("rejects with timeout when no result arrives in time", async () => {
		const fx = buildIframeWindow();
		const promise = getCatalog({ window: fx.childWindow, timeoutMs: 10 });
		await expect(promise).rejects.toMatchObject({ code: "timeout" });
		expect(fx.listenerCount()).toBe(0);
	});
});
