import { createMetricsClient } from "../client";
import { createMemoryAdapter } from "../adapters/memory";
import { createMetricsHost } from "../host";

/**
 * End-to-end test running both sides of the MessageChannel in the same jsdom
 * realm. We simulate the host's iframe.contentWindow.postMessage by wiring it
 * to the client's target window's `message` event.
 */
function wire(): {
	host: ReturnType<typeof createMetricsHost>;
	client: ReturnType<typeof createMetricsClient>;
	stop: () => void;
} {
	const clientTarget: EventTarget = new EventTarget();
	const dispatchToClient = (data: unknown, transfer: MessagePort[]) => {
		const event = new MessageEvent("message", {
			data,
			ports: transfer as unknown as MessagePort[],
		});
		clientTarget.dispatchEvent(event);
	};

	const fakeContentWindow = {
		postMessage(
			data: unknown,
			_origin: string,
			transfer?: readonly MessagePort[],
		) {
			dispatchToClient(data, (transfer ?? []) as MessagePort[]);
		},
	} as unknown as Window;

	const iframe = { contentWindow: fakeContentWindow } as unknown as HTMLIFrameElement;

	const host = createMetricsHost({
		iframe,
		appId: "app-a",
		walletAddress: "0xwallet",
		storage: createMemoryAdapter(),
	});

	const client = createMetricsClient({
		target: clientTarget as unknown as Window,
		handshakeTimeoutMs: 1_000,
	});

	host.start();

	return {
		host,
		client,
		stop: () => host.stop(),
	};
}

describe("createMetricsClient (e2e via MessageChannel)", () => {
	it("records and queries end-to-end", async () => {
		const { client, stop } = wire();
		const out = await client.record({
			type: "ping",
			data: { ok: true },
		});
		expect(typeof out.id).toBe("string");

		const rows = await client.query();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ type: "ping", data: { ok: true } });
		stop();
	});

	it("propagates host errors as Promise rejections", async () => {
		const { client, stop } = wire();
		await expect(
			client.record({ type: "BAD TYPE", data: 1 }),
		).rejects.toThrow(/invalid_payload/);
		stop();
	});

	it("clear empties only the app's own records", async () => {
		const { client, stop } = wire();
		await client.record({ type: "a", data: 1 });
		await client.record({ type: "a", data: 2 });
		expect(await client.query()).toHaveLength(2);
		await client.clear();
		expect(await client.query()).toHaveLength(0);
		stop();
	});
});
