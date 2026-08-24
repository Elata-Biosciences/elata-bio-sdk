import {
	captureBiosignalInitPort,
	postBiosignalInit,
} from "../protocol/handshake";
import type { HandshakeMessageTarget } from "../protocol/handshake";
import {
	BIOSIGNAL_INIT_MESSAGE_KIND,
	BIOSIGNAL_PROTOCOL_VERSION,
} from "../protocol/messages";

type Listener = (event: MessageEvent) => void;

/** Minimal `window`-like message target the client capture listens on. */
function createFakeTarget(): HandshakeMessageTarget & {
	emit(data: unknown, ports?: MessagePort[]): void;
	listenerCount(): number;
} {
	const listeners = new Set<Listener>();
	return {
		addEventListener(_type: "message", listener: Listener) {
			listeners.add(listener);
		},
		removeEventListener(_type: "message", listener: Listener) {
			listeners.delete(listener);
		},
		emit(data: unknown, ports: MessagePort[] = []) {
			for (const listener of [...listeners]) {
				listener({ data, ports } as unknown as MessageEvent);
			}
		},
		listenerCount() {
			return listeners.size;
		},
	};
}

describe("host-side initiation", () => {
	it("posts the canonical init message with port2 transferred and returns port1", () => {
		const posted: { message: unknown; transfer: readonly Transferable[] }[] = [];
		const { port1, channel } = postBiosignalInit((message, transfer) => {
			posted.push({ message, transfer });
		});
		expect(posted).toHaveLength(1);
		expect(posted[0].message).toEqual({
			kind: BIOSIGNAL_INIT_MESSAGE_KIND,
			v: BIOSIGNAL_PROTOCOL_VERSION,
		});
		expect(posted[0].transfer).toEqual([channel.port2]);
		expect(port1).toBe(channel.port1);
		port1.close();
		channel.port2.close();
	});

	it("accepts an injected channel", () => {
		const channel = new MessageChannel();
		const result = postBiosignalInit(() => {}, channel);
		expect(result.channel).toBe(channel);
		expect(result.port1).toBe(channel.port1);
		channel.port1.close();
		channel.port2.close();
	});
});

describe("client-side one-shot capture", () => {
	it("captures the port from a valid init message", async () => {
		const target = createFakeTarget();
		const channel = new MessageChannel();
		const captured = captureBiosignalInitPort({ target });
		target.emit(
			{ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 },
			[channel.port2 as unknown as MessagePort],
		);
		await expect(captured).resolves.toBe(channel.port2);
		expect(target.listenerCount()).toBe(0);
		channel.port1.close();
		channel.port2.close();
	});

	it("round-trips a message over the captured port", async () => {
		const target = createFakeTarget();
		const channel = new MessageChannel();
		const captured = captureBiosignalInitPort({ target });
		target.emit(
			{ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 },
			[channel.port2 as unknown as MessagePort],
		);
		const port = await captured;
		const received = new Promise<unknown>((resolve) => {
			channel.port1.onmessage = (event) => resolve(event.data);
		});
		port.postMessage({ hello: "host" });
		await expect(received).resolves.toEqual({ hello: "host" });
		channel.port1.close();
		channel.port2.close();
	});

	it("rejects a version mismatch with protocol_mismatch", async () => {
		const target = createFakeTarget();
		const channel = new MessageChannel();
		const captured = captureBiosignalInitPort({ target });
		target.emit(
			{ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 2 },
			[channel.port2 as unknown as MessagePort],
		);
		await expect(captured).rejects.toMatchObject({ code: "protocol_mismatch" });
		expect(target.listenerCount()).toBe(0);
		channel.port1.close();
		channel.port2.close();
	});

	it("ignores unrelated messages and init messages without a port", async () => {
		const target = createFakeTarget();
		const channel = new MessageChannel();
		const captured = captureBiosignalInitPort({ target });
		target.emit({ some: "other-message" });
		target.emit({ kind: "__elata_metrics_init", v: 1 });
		target.emit({ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 }); // no port
		expect(target.listenerCount()).toBe(1);
		target.emit(
			{ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 },
			[channel.port2 as unknown as MessagePort],
		);
		await expect(captured).resolves.toBe(channel.port2);
		channel.port1.close();
		channel.port2.close();
	});

	it("ignores a duplicate init — the first captured port stands", async () => {
		const target = createFakeTarget();
		const first = new MessageChannel();
		const second = new MessageChannel();
		const captured = captureBiosignalInitPort({ target });
		target.emit(
			{ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 },
			[first.port2 as unknown as MessagePort],
		);
		target.emit(
			{ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 },
			[second.port2 as unknown as MessagePort],
		);
		await expect(captured).resolves.toBe(first.port2);
		expect(target.listenerCount()).toBe(0);
		for (const channel of [first, second]) {
			channel.port1.close();
			channel.port2.close();
		}
	});

	it("times out after the default 5000 ms with handshake_timeout", async () => {
		const target = createFakeTarget();
		const timeouts: { callback: () => void; ms: number }[] = [];
		const captured = captureBiosignalInitPort({
			target,
			setTimeoutFn: (callback, ms) => {
				timeouts.push({ callback, ms });
				return 1;
			},
			clearTimeoutFn: () => {},
		});
		expect(timeouts).toHaveLength(1);
		expect(timeouts[0].ms).toBe(5000);
		timeouts[0].callback();
		await expect(captured).rejects.toMatchObject({ code: "handshake_timeout" });
		expect(target.listenerCount()).toBe(0);
	});

	it("clears the timer once captured", async () => {
		const target = createFakeTarget();
		const channel = new MessageChannel();
		let cleared: unknown = null;
		const captured = captureBiosignalInitPort({
			target,
			timeoutMs: 1234,
			setTimeoutFn: (_callback, ms) => {
				expect(ms).toBe(1234);
				return 77;
			},
			clearTimeoutFn: (handle) => {
				cleared = handle;
			},
		});
		target.emit(
			{ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 },
			[channel.port2 as unknown as MessagePort],
		);
		await captured;
		expect(cleared).toBe(77);
		channel.port1.close();
		channel.port2.close();
	});

	it("never schedules a timer for timeoutMs: Infinity", async () => {
		const target = createFakeTarget();
		const channel = new MessageChannel();
		const captured = captureBiosignalInitPort({
			target,
			timeoutMs: Number.POSITIVE_INFINITY,
			setTimeoutFn: () => {
				throw new Error("must not schedule a timer");
			},
		});
		target.emit(
			{ kind: BIOSIGNAL_INIT_MESSAGE_KIND, v: 1 },
			[channel.port2 as unknown as MessagePort],
		);
		await expect(captured).resolves.toBe(channel.port2);
		channel.port1.close();
		channel.port2.close();
	});

	it("host and client complete a real MessageChannel handshake end to end", async () => {
		const target = createFakeTarget();
		const captured = captureBiosignalInitPort({ target });
		const { port1 } = postBiosignalInit((message, transfer) => {
			target.emit(message, transfer as MessagePort[]);
		});
		const clientPort = await captured;
		const received = new Promise<unknown>((resolve) => {
			port1.onmessage = (event) => resolve(event.data);
		});
		clientPort.postMessage({ v: 1, id: "r1", op: "ping" });
		await expect(received).resolves.toEqual({ v: 1, id: "r1", op: "ping" });
		port1.close();
		clientPort.close();
	});
});
