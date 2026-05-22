import { createMemoryAdapter } from "../adapters/memory";
import {
	createMetricsHost,
	type MetricsHost,
} from "../host";
import {
	type AppRecord,
	type AppScore,
	type HostResponse,
	INIT_MESSAGE_KIND,
	PROTOCOL_VERSION,
} from "../protocol";

interface FakeFrame {
	contentWindow: {
		postMessage: jest.Mock<
			void,
			[message: unknown, targetOrigin: string, transfer: Transferable[]]
		>;
	};
}

/**
 * Set up a host wired to a freshly-allocated MessageChannel and a fake iframe.
 * The returned `appPort` is the port the sandboxed app would receive — tests
 * send requests through it and assert on responses.
 */
function setupHost(
	overrides: Partial<{
		walletAddress: string;
		appId: string;
		quotaBytes: number;
		maxRecordBytes: number;
		writeRateLimit: { count: number; windowMs: number };
		now: () => number;
		randomId: () => string;
	}> = {},
): { host: MetricsHost; appPort: MessagePort; storage: ReturnType<typeof createMemoryAdapter> } {
	const storage = createMemoryAdapter();
	const fakeFrame: FakeFrame = {
		contentWindow: { postMessage: jest.fn() },
	};
	const host = createMetricsHost({
		iframe: fakeFrame as unknown as HTMLIFrameElement,
		appId: overrides.appId ?? "app-1",
		walletAddress: overrides.walletAddress ?? "0xWALLET",
		storage,
		quotaBytes: overrides.quotaBytes,
		maxRecordBytes: overrides.maxRecordBytes,
		writeRateLimit: overrides.writeRateLimit,
		now: overrides.now,
		randomId: overrides.randomId,
	});
	host.start();
	expect(fakeFrame.contentWindow.postMessage).toHaveBeenCalledTimes(1);
	const [message, _origin, transfer] = fakeFrame.contentWindow.postMessage.mock
		.calls[0]!;
	expect(message).toEqual({ kind: INIT_MESSAGE_KIND, v: PROTOCOL_VERSION });
	const appPort = transfer[0] as MessagePort;
	appPort.start();
	return { host, appPort, storage };
}

function call<T = unknown>(
	port: MessagePort,
	request: Record<string, unknown>,
): Promise<HostResponse & { result?: T }> {
	const id = `c_${Math.random().toString(36).slice(2)}`;
	return new Promise((resolve) => {
		const handler = (ev: MessageEvent<unknown>) => {
			const data = ev.data as HostResponse;
			if (data && data.id === id) {
				port.removeEventListener("message", handler as EventListener);
				resolve(data as HostResponse & { result?: T });
			}
		};
		port.addEventListener("message", handler as EventListener);
		port.postMessage({ v: PROTOCOL_VERSION, id, ...request });
	});
}

describe("host: record / query / clear", () => {
	test("record persists and query returns it", async () => {
		const { appPort, host } = setupHost();
		try {
			const saved = await call(appPort, {
				op: "record",
				type: "level_complete",
				data: { level: 1 },
			});
			expect(saved.ok).toBe(true);

			const queried = await call<AppRecord[]>(appPort, {
				op: "query",
				filter: {},
			});
			expect(queried.ok).toBe(true);
			expect(queried.result).toHaveLength(1);
			expect(queried.result?.[0]?.type).toBe("level_complete");
		} finally {
			host.stop();
		}
	});

	test("clear wipes both records and scores for the scope", async () => {
		const { appPort, host } = setupHost();
		try {
			await call(appPort, { op: "record", type: "x", data: 1 });
			await call(appPort, { op: "saveScore", value: 10 });
			await call(appPort, { op: "clear", scope: "app" });

			const r = await call<AppRecord[]>(appPort, { op: "query", filter: {} });
			expect(r.result).toEqual([]);
			const s = await call<AppScore[]>(appPort, { op: "loadScores", filter: {} });
			expect(s.result).toEqual([]);
		} finally {
			host.stop();
		}
	});
});

describe("host: saveScore", () => {
	test("rejects NaN and Infinity", async () => {
		const { appPort, host } = setupHost();
		try {
			const nanRes = await call(appPort, { op: "saveScore", value: Number.NaN });
			expect(nanRes.ok).toBe(false);
			expect(nanRes.ok || (nanRes as { error: string }).error).toBe("invalid_payload");

			const infRes = await call(appPort, {
				op: "saveScore",
				value: Number.POSITIVE_INFINITY,
			});
			expect(infRes.ok).toBe(false);
		} finally {
			host.stop();
		}
	});

	test("accepts negative values and zero", async () => {
		const { appPort, host } = setupHost();
		try {
			const a = await call(appPort, { op: "saveScore", value: 0 });
			const b = await call(appPort, { op: "saveScore", value: -42 });
			expect(a.ok).toBe(true);
			expect(b.ok).toBe(true);
		} finally {
			host.stop();
		}
	});

	test("size accounting includes meta", async () => {
		const { appPort, host } = setupHost({ maxRecordBytes: 64 });
		try {
			const tinyOk = await call(appPort, { op: "saveScore", value: 1 });
			expect(tinyOk.ok).toBe(true);

			const bigMeta = "x".repeat(100);
			const oversize = await call(appPort, {
				op: "saveScore",
				value: 1,
				meta: { s: bigMeta },
			});
			expect(oversize.ok).toBe(false);
		} finally {
			host.stop();
		}
	});

	test("contributes to quota with records", async () => {
		const { appPort, host } = setupHost({ quotaBytes: 60 });
		try {
			const r = await call(appPort, { op: "record", type: "t", data: "x".repeat(30) });
			expect(r.ok).toBe(true);
			const overshoot = await call(appPort, {
				op: "saveScore",
				value: 1,
				meta: { s: "x".repeat(100) },
			});
			expect(overshoot.ok).toBe(false);
			expect(overshoot.ok || (overshoot as { error: string }).error).toBe(
				"quota_exceeded",
			);
		} finally {
			host.stop();
		}
	});
});

describe("host: loadScores", () => {
	test("default order is value_desc", async () => {
		const { appPort, host } = setupHost();
		try {
			await call(appPort, { op: "saveScore", value: 1 });
			await call(appPort, { op: "saveScore", value: 100 });
			await call(appPort, { op: "saveScore", value: 50 });

			const res = await call<AppScore[]>(appPort, {
				op: "loadScores",
				filter: {},
			});
			expect(res.ok).toBe(true);
			expect(res.result?.map((s) => s.value)).toEqual([100, 50, 1]);
		} finally {
			host.stop();
		}
	});

	test("timestamp_desc returns recent first", async () => {
		let t = 1_000;
		const { appPort, host } = setupHost({ now: () => t });
		try {
			await call(appPort, { op: "saveScore", value: 10 });
			t = 2_000;
			await call(appPort, { op: "saveScore", value: 5 });
			t = 3_000;
			await call(appPort, { op: "saveScore", value: 8 });

			const res = await call<AppScore[]>(appPort, {
				op: "loadScores",
				filter: { order: "timestamp_desc" },
			});
			expect(res.result?.map((s) => s.timestamp)).toEqual([3_000, 2_000, 1_000]);
		} finally {
			host.stop();
		}
	});

	test("query (records) does not include scores; loadScores does not include records", async () => {
		const { appPort, host } = setupHost();
		try {
			await call(appPort, { op: "record", type: "evt", data: 1 });
			await call(appPort, { op: "saveScore", value: 99 });

			const records = await call<AppRecord[]>(appPort, {
				op: "query",
				filter: {},
			});
			expect(records.result).toHaveLength(1);
			expect((records.result?.[0] as AppRecord).type).toBe("evt");

			const scores = await call<AppScore[]>(appPort, {
				op: "loadScores",
				filter: {},
			});
			expect(scores.result).toHaveLength(1);
			expect((scores.result?.[0] as AppScore).value).toBe(99);
		} finally {
			host.stop();
		}
	});

	test("limit caps result count", async () => {
		const { appPort, host } = setupHost();
		try {
			for (let i = 0; i < 20; i++) {
				await call(appPort, { op: "saveScore", value: i });
			}
			const res = await call<AppScore[]>(appPort, {
				op: "loadScores",
				filter: { limit: 5 },
			});
			expect(res.result).toHaveLength(5);
			expect(res.result?.[0]?.value).toBe(19);
		} finally {
			host.stop();
		}
	});
});

describe("host: invalid payload", () => {
	test("unknown op returns invalid_payload", async () => {
		const { appPort, host } = setupHost();
		try {
			const res = await call(appPort, { op: "bogus" });
			expect(res.ok).toBe(false);
			expect((res as { error: string }).error).toBe("invalid_payload");
		} finally {
			host.stop();
		}
	});
});
