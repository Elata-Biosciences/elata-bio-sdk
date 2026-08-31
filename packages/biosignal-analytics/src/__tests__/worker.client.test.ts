/**
 * Worker protocol round-trip over a real MessageChannel (node:worker_threads
 * via jest.setup.cjs): the worker handler attaches to port1, the client to
 * port2 — exactly the production topology minus the Worker constructor.
 */

import { attachAnalyticsWorker } from "../worker/analyticsWorker.js";
import { createAnalyticsWorkerClient } from "../worker/client.js";
import {
	ANALYTICS_WORKER_PROTOCOL_VERSION,
	isAnalyticsWorkerRequest,
	isAnalyticsWorkerResponse,
	type AnalyticsPortLike,
} from "../worker/protocol.js";
import { syntheticEegInterleaved, syntheticIbisMs } from "../testing/synthetic.js";

function connectedClient() {
	const channel = new MessageChannel();
	const detach = attachAnalyticsWorker(channel.port1 as unknown as AnalyticsPortLike);
	const client = createAnalyticsWorkerClient({
		port: channel.port2 as unknown as AnalyticsPortLike,
	});
	return {
		client,
		dispose: () => {
			client.dispose();
			detach();
			channel.port1.close();
			channel.port2.close();
		},
	};
}

describe("analytics worker protocol round-trip", () => {
	test("ping returns the protocol version", async () => {
		const { client, dispose } = connectedClient();
		try {
			await expect(client.ping()).resolves.toEqual({
				pong: true,
				protocolVersion: ANALYTICS_WORKER_PROTOCOL_VERSION,
			});
		} finally {
			dispose();
		}
	});

	test("pulse/hrv computes real HRV over the wire", async () => {
		const { client, dispose } = connectedClient();
		try {
			const ibis = syntheticIbisMs({ seed: 3, count: 120 });
			const result = await client.hrvTimeDomain(ibis);
			expect(result.ibiCount).toBeGreaterThan(100);
			expect(result.meanNnMs).toBeGreaterThan(600);
			expect(result.rmssdMs).not.toBeNull();
		} finally {
			dispose();
		}
	});

	test("eeg/analyze round-trips with a transferred Float32Array", async () => {
		const { client, dispose } = connectedClient();
		try {
			const { samples, sampleRateHz, channels } = syntheticEegInterleaved({
				durationS: 40,
				channelCount: 2,
				seed: 4,
			});
			const result = await client.analyzeEeg({
				samples,
				sampleRateHz,
				channels,
				sessionId: "worker-session",
			});
			expect(result.perWindow.length).toBe(3);
			expect(result.observations.length).toBeGreaterThan(0);
			expect(result.observations[0].sessionId).toBe("worker-session");
			// The buffer was transferred away from this thread.
			expect(samples.buffer.byteLength).toBe(0);
		} finally {
			dispose();
		}
	});

	test("invalid payloads map to invalid_input errors", async () => {
		const channel = new MessageChannel();
		const detach = attachAnalyticsWorker(channel.port1 as unknown as AnalyticsPortLike);
		const responses: { ok: boolean; error?: { code: string } }[] = [];
		(channel.port2 as unknown as AnalyticsPortLike).onmessage = (event) => {
			responses.push(event.data as { ok: boolean; error?: { code: string } });
		};
		channel.port2.postMessage({
			v: ANALYTICS_WORKER_PROTOCOL_VERSION,
			id: "bad-1",
			op: "eeg/analyze",
			payload: { samples: "not-a-float32array", sampleRateHz: 256, channels: ["ch0"] },
		});
		channel.port2.postMessage({
			v: ANALYTICS_WORKER_PROTOCOL_VERSION,
			id: "bad-2",
			op: "pulse/hrv",
			payload: { ibisMs: "nope" },
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(responses).toHaveLength(2);
		for (const response of responses) {
			expect(response.ok).toBe(false);
			expect(response.error?.code).toBe("invalid_input");
		}
		detach();
		channel.port1.close();
		channel.port2.close();
	});

	test("unknown ops and malformed envelopes are safe", async () => {
		const channel = new MessageChannel();
		const detach = attachAnalyticsWorker(channel.port1 as unknown as AnalyticsPortLike);
		const responses: unknown[] = [];
		(channel.port2 as unknown as AnalyticsPortLike).onmessage = (event) => {
			responses.push(event.data);
		};
		channel.port2.postMessage({ not: "a request" });
		channel.port2.postMessage({
			v: ANALYTICS_WORKER_PROTOCOL_VERSION,
			id: "x-1",
			op: "nope/never",
		});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(responses).toHaveLength(1);
		const failure = responses[0] as { ok: boolean; error: { code: string } };
		expect(isAnalyticsWorkerResponse(failure)).toBe(true);
		expect(failure.ok).toBe(false);
		expect(failure.error.code).toBe("invalid_input");
		detach();
		channel.port1.close();
		channel.port2.close();
	});

	test("dispose rejects in-flight requests and blocks new ones", async () => {
		const channel = new MessageChannel();
		// No worker attached: requests stay pending until dispose.
		const client = createAnalyticsWorkerClient({
			port: channel.port2 as unknown as AnalyticsPortLike,
		});
		const pending = client.ping();
		client.dispose();
		await expect(pending).rejects.toMatchObject({ code: "worker_terminated" });
		await expect(client.ping()).rejects.toMatchObject({ code: "worker_terminated" });
		channel.port1.close();
		channel.port2.close();
	});

	test("envelope guards accept only versioned shapes", () => {
		expect(isAnalyticsWorkerRequest({ v: 1, id: "a", op: "ping" })).toBe(true);
		expect(isAnalyticsWorkerRequest({ v: 2, id: "a", op: "ping" })).toBe(false);
		expect(isAnalyticsWorkerRequest(null)).toBe(false);
		expect(isAnalyticsWorkerResponse({ v: 1, id: "a", ok: true, payload: 1 })).toBe(true);
		expect(isAnalyticsWorkerResponse({ v: 1, id: "a" })).toBe(false);
	});
});
