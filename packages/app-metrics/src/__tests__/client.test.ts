import { createMetricsClient } from "../client";
import {
	type HostResponse,
	INIT_MESSAGE_KIND,
	PROTOCOL_VERSION,
} from "../protocol";

/**
 * The client listens on a Window for the init message and captures a transferred
 * port. We simulate this by dispatching a synthetic `message` event on a fake
 * EventTarget that satisfies the parts of `Window` the client uses.
 */
interface FakeWindow extends EventTarget {
	postMessage?: (message: unknown, targetOrigin?: string) => void;
}

function makeFakeWindow(): FakeWindow {
	const target = new EventTarget();
	return target as FakeWindow;
}

function fireInit(win: FakeWindow, port: MessagePort) {
	const ev = new MessageEvent("message", {
		data: { kind: INIT_MESSAGE_KIND, v: PROTOCOL_VERSION },
		ports: [port],
	});
	win.dispatchEvent(ev);
}

describe("createMetricsClient", () => {
	test("handshake captures port and forwards calls", async () => {
		const win = makeFakeWindow();
		const client = createMetricsClient({ window: win as unknown as Window });

		const channel = new MessageChannel();
		const hostPort = channel.port1;
		hostPort.onmessage = (ev) => {
			const req = ev.data as { id: string; op: string };
			const response: HostResponse = {
				v: 1,
				id: req.id,
				ok: true,
				result: { id: "fake", timestamp: 1 },
			};
			hostPort.postMessage(response);
		};
		hostPort.start();

		fireInit(win, channel.port2);
		await client.ready();
		expect(client.isReady()).toBe(true);

		const result = await client.saveScore({ value: 42 });
		expect(result).toEqual({ id: "fake", timestamp: 1 });
		client.dispose();
	});

	test("calls made before handshake queue and resolve after init", async () => {
		const win = makeFakeWindow();
		const client = createMetricsClient({ window: win as unknown as Window });

		const channel = new MessageChannel();
		const hostPort = channel.port1;
		hostPort.onmessage = (ev) => {
			const req = ev.data as { id: string };
			hostPort.postMessage({ v: 1, id: req.id, ok: true, result: [] });
		};
		hostPort.start();

		const queryPromise = client.query({});
		fireInit(win, channel.port2);
		await expect(queryPromise).resolves.toEqual([]);
		client.dispose();
	});

	test("handshake timeout rejects pending calls", async () => {
		jest.useFakeTimers();
		const win = makeFakeWindow();
		const client = createMetricsClient({
			window: win as unknown as Window,
			handshakeTimeoutMs: 100,
		});

		const callPromise = client.saveScore({ value: 1 });
		jest.advanceTimersByTime(150);
		jest.useRealTimers();

		await expect(callPromise).rejects.toMatchObject({ code: "handshake_timeout" });
		client.dispose();
	});

	test("dispose rejects pending calls", async () => {
		const win = makeFakeWindow();
		const client = createMetricsClient({
			window: win as unknown as Window,
			handshakeTimeoutMs: Number.POSITIVE_INFINITY,
		});
		const pending = client.saveScore({ value: 1 });
		client.dispose();
		await expect(pending).rejects.toMatchObject({ code: "disposed" });
	});

	test("host error surfaces with error code", async () => {
		const win = makeFakeWindow();
		const client = createMetricsClient({ window: win as unknown as Window });

		const channel = new MessageChannel();
		const hostPort = channel.port1;
		hostPort.onmessage = (ev) => {
			const req = ev.data as { id: string };
			hostPort.postMessage({
				v: 1,
				id: req.id,
				ok: false,
				error: "quota_exceeded",
			});
		};
		hostPort.start();

		fireInit(win, channel.port2);
		await client.ready();

		await expect(client.saveScore({ value: 1 })).rejects.toMatchObject({
			code: "quota_exceeded",
		});
		client.dispose();
	});
});
