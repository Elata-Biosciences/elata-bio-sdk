import { createMemoryAdapter } from "../adapters/memory";
import { createMetricsHost } from "../host";
import {
	type HostResponse,
	INIT_MESSAGE_KIND,
	PROTOCOL_VERSION,
} from "../protocol";

/**
 * Wire the host to a fake iframe and drive it through a MessageChannel.
 * Returns a `send` helper that posts on the app side and resolves with the host's reply.
 */
function setupHost(
	overrides: Partial<Parameters<typeof createMetricsHost>[0]> = {},
) {
	const captured: { ports: readonly MessagePort[] | null } = { ports: null };

	const fakeWindow = {
		postMessage(
			_msg: unknown,
			_origin: string,
			transfer?: readonly MessagePort[],
		) {
			captured.ports = transfer ?? null;
		},
	} as unknown as Window;

	const iframe = { contentWindow: fakeWindow } as unknown as HTMLIFrameElement;

	const host = createMetricsHost({
		iframe,
		appId: "app-a",
		walletAddress: "0xwallet",
		storage: createMemoryAdapter(),
		now: () => 1_000_000,
		randomId: (() => {
			let n = 0;
			return () => `id${++n}`;
		})(),
		...overrides,
	});

	host.start();
	const port2 = captured.ports?.[0];
	if (!port2) throw new Error("host did not transfer a port");

	const pending = new Map<string, (r: HostResponse) => void>();
	port2.onmessage = (ev: MessageEvent) => {
		const r = ev.data as HostResponse;
		pending.get(r.id)?.(r);
		pending.delete(r.id);
	};
	port2.start();

	const send = (req: unknown, id: string): Promise<HostResponse> =>
		new Promise((resolve) => {
			pending.set(id, resolve);
			port2.postMessage(req);
		});

	return { host, send, port2 };
}

describe("createMetricsHost", () => {
	it("transfers a port via init message", () => {
		const captured: {
			msg: unknown;
			ports: readonly MessagePort[] | null;
		} = { msg: null, ports: null };
		const fakeWindow = {
			postMessage(
				msg: unknown,
				_origin: string,
				transfer?: readonly MessagePort[],
			) {
				captured.msg = msg;
				captured.ports = transfer ?? null;
			},
		} as unknown as Window;
		const iframe = { contentWindow: fakeWindow } as unknown as HTMLIFrameElement;

		const host = createMetricsHost({
			iframe,
			appId: "x",
			walletAddress: "0xw",
			storage: createMemoryAdapter(),
		});
		host.start();

		expect(captured.msg).toEqual({ kind: INIT_MESSAGE_KIND, v: PROTOCOL_VERSION });
		expect(captured.ports?.length).toBe(1);
		host.stop();
	});

	it("records and queries", async () => {
		const { send, host } = setupHost();
		const r1 = await send(
			{ v: 1, id: "q1", op: "record", type: "level_complete", data: { level: 1 } },
			"q1",
		);
		expect(r1).toMatchObject({ ok: true });

		const r2 = await send({ v: 1, id: "q2", op: "query", filter: {} }, "q2");
		expect(r2.ok).toBe(true);
		const result = (r2 as { result: unknown[] }).result;
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			type: "level_complete",
			data: { level: 1 },
			timestamp: 1_000_000,
		});
		host.stop();
	});

	it("rejects malformed requests with invalid_payload", async () => {
		const { send, host } = setupHost();
		const resp = await send({ v: 1, id: "bad", op: "nope" }, "bad");
		expect(resp).toEqual({ v: 1, id: "bad", ok: false, error: "invalid_payload" });
		host.stop();
	});

	it("rejects record types that don't match the pattern", async () => {
		const { send, host } = setupHost();
		const resp = await send(
			{ v: 1, id: "t", op: "record", type: "BadType", data: 1 },
			"t",
		);
		expect(resp).toMatchObject({ ok: false, error: "invalid_payload" });
		host.stop();
	});

	it("enforces max record size", async () => {
		const { send, host } = setupHost({ maxRecordBytes: 100 });
		const big = "x".repeat(200);
		const resp = await send(
			{ v: 1, id: "big", op: "record", type: "blob", data: big },
			"big",
		);
		expect(resp).toMatchObject({ ok: false, error: "invalid_payload" });
		host.stop();
	});

	it("enforces per-app quota", async () => {
		const { send, host } = setupHost({
			quotaBytes: 50,
			maxRecordBytes: 40,
		});
		const fits = await send(
			{ v: 1, id: "a", op: "record", type: "blob", data: "x".repeat(30) },
			"a",
		);
		expect(fits).toMatchObject({ ok: true });

		const overflows = await send(
			{ v: 1, id: "b", op: "record", type: "blob", data: "x".repeat(30) },
			"b",
		);
		expect(overflows).toMatchObject({ ok: false, error: "quota_exceeded" });
		host.stop();
	});

	it("rate-limits writes inside the window", async () => {
		const { send, host } = setupHost({
			writeRateLimit: { count: 2, windowMs: 10_000 },
		});
		const r1 = await send(
			{ v: 1, id: "1", op: "record", type: "x", data: 1 },
			"1",
		);
		const r2 = await send(
			{ v: 1, id: "2", op: "record", type: "x", data: 1 },
			"2",
		);
		const r3 = await send(
			{ v: 1, id: "3", op: "record", type: "x", data: 1 },
			"3",
		);
		expect(r1).toMatchObject({ ok: true });
		expect(r2).toMatchObject({ ok: true });
		expect(r3).toMatchObject({ ok: false, error: "rate_limited" });
		host.stop();
	});

	it("clear removes only this app's records", async () => {
		const storage = createMemoryAdapter();
		// Pre-seed another app's data through a second host instance.
		const otherHost = createMetricsHost({
			iframe: { contentWindow: { postMessage() {} } as unknown as Window } as HTMLIFrameElement,
			appId: "other-app",
			walletAddress: "0xwallet",
			storage,
		});
		otherHost.start();
		// Use storage directly to seed without going through the wire:
		await storage.put({
			id: "seed",
			walletAddress: "0xwallet",
			appId: "other-app",
			type: "ping",
			data: 1,
			timestamp: 1,
			sizeBytes: 4,
		});

		const { send, host } = setupHost({ storage });
		await send(
			{ v: 1, id: "1", op: "record", type: "level", data: 1 },
			"1",
		);
		await send({ v: 1, id: "2", op: "clear", scope: "app" }, "2");

		const owned = await storage.query("0xwallet", "app-a", {});
		const other = await storage.query("0xwallet", "other-app", {});
		expect(owned).toHaveLength(0);
		expect(other).toHaveLength(1);
		host.stop();
		otherHost.stop();
	});

	it("isolates two apps sharing the same storage adapter", async () => {
		const storage = createMemoryAdapter();
		const a = setupHost({ storage });
		// Build a separate host for app-b on the same storage:
		const captured: { ports: readonly MessagePort[] | null } = { ports: null };
		const win = {
			postMessage(
				_m: unknown,
				_o: string,
				transfer?: readonly MessagePort[],
			) {
				captured.ports = transfer ?? null;
			},
		} as unknown as Window;
		const hostB = createMetricsHost({
			iframe: { contentWindow: win } as unknown as HTMLIFrameElement,
			appId: "app-b",
			walletAddress: "0xwallet",
			storage,
		});
		hostB.start();
		const portB = captured.ports?.[0];
		if (!portB) throw new Error("missing port");

		await a.send(
			{ v: 1, id: "ra", op: "record", type: "a_event", data: 1 },
			"ra",
		);
		const replyB = await new Promise<HostResponse>((resolve) => {
			portB.onmessage = (ev: MessageEvent) => resolve(ev.data as HostResponse);
			portB.start();
			portB.postMessage({ v: 1, id: "qb", op: "query", filter: {} });
		});
		expect(replyB).toMatchObject({ ok: true });
		expect((replyB as { result: unknown[] }).result).toHaveLength(0);

		a.host.stop();
		hostB.stop();
	});
});
