/**
 * In-flight window and buffer-pressure behavior: at most N unACKed chunks
 * per stream on the wire, degraded state at the soft buffer limit (with a
 * quality event, data kept), abort with `storage_stalled` at the hard limit
 * (explicit, never a silent drop).
 */

import { RecorderCore } from "../client/recorderCore";
import type { StreamDescriptorDraft } from "../contracts/session";
import { createFakeClock } from "../testing/fakeClock";
import {
	createLoopbackPortPair,
	createMemoryHost,
	settleMicrotasks,
} from "../testing/memoryHost";
import { createRecorderHarness } from "../testing/recorderHarness";
import type { ProtocolPort, RecorderWorkerToClient } from "../worker/workerMessages";

const eegDraft: StreamDescriptorDraft = {
	sourceId: "src",
	modality: "eeg",
	sampling: "regular",
	sampleRateHz: 100,
	channels: [{ name: "ch1" }],
	encoding: "arrow-ipc",
	arrowSchemaId: "regular-wide-f32@1",
	layout: "wide",
	clockSource: "local",
};

function samples(count: number, base = 0): Float32Array {
	const data = new Float32Array(count);
	for (let i = 0; i < count; i++) data[i] = base + i;
	return data;
}

/** Wrap a port to observe what the client puts on the wire. */
function spyPort(inner: ProtocolPort): { port: ProtocolPort; sent: unknown[] } {
	const sent: unknown[] = [];
	const port: ProtocolPort = {
		get onmessage() {
			return inner.onmessage;
		},
		set onmessage(listener) {
			inner.onmessage = listener;
		},
		postMessage(message, transfer) {
			sent.push(message);
			inner.postMessage(message, transfer);
		},
		start() {
			inner.start?.();
		},
		close() {
			inner.close?.();
		},
	};
	return { port, sent };
}

const isCommit = (message: unknown): boolean =>
	typeof message === "object" &&
	message !== null &&
	(message as { op?: unknown }).op === "chunk/commit";

async function windowScenario(windowSize: number) {
	const clock = createFakeClock();
	const host = createMemoryHost({ nowMs: () => clock.monotonicNow() });
	const [clientPort, hostPort] = createLoopbackPortPair();
	host.attach(hostPort);
	const spy = spyPort(clientPort);
	const events: RecorderWorkerToClient[] = [];
	const core = new RecorderCore({
		emit: (message) => events.push(message),
		now: () => clock.monotonicNow(),
		jitter: () => 0,
	});
	core.handle({
		t: "init",
		port: spy.port,
		config: { inFlightWindow: windowSize, chunkTargetBytes: 40 }, // 10-row chunks
	});
	await settleMicrotasks();
	core.handle({
		t: "session/start",
		spec: {
			startedAtUtcMs: clock.utcNow(),
			startedAtMonotonicMs: clock.monotonicNow(),
			sources: [
				{ kind: "synthetic", name: "s", adapter: "synthetic@1", sdkPackages: [] },
			],
			provenance: { recorderVersion: "0.1.0", protocolVersion: 1, sdkPackages: [] },
		},
	});
	await settleMicrotasks();
	core.handle({ t: "stream/open", clientStreamId: "cs-1", draft: eegDraft });
	await settleMicrotasks();
	return { clock, host, core, spy, events };
}

describe.each([2, 4, 8])("in-flight window %i", (windowSize) => {
	it("caps unACKed commits on the wire and drains in order after resume", async () => {
		const s = await windowScenario(windowSize);
		s.host.pause();
		// Push 12 chunks worth of samples (120 rows, 10 rows per chunk).
		for (let batch = 0; batch < 12; batch++) {
			s.core.handle({
				t: "samples",
				clientStreamId: "cs-1",
				sampleIndex0: batch * 10,
				timeUs0: batch * 100_000,
				rows: 10,
				channels: 1,
				data: samples(10, batch * 10).buffer,
			});
		}
		await settleMicrotasks();
		// Only `windowSize` commits went out while ACKs are withheld.
		expect(s.spy.sent.filter(isCommit)).toHaveLength(windowSize);

		s.host.resume();
		await settleMicrotasks();
		// Draining is pumped by ACK arrivals — settle until stable.
		for (let i = 0; i < 12; i++) {
			s.core.tick();
			await settleMicrotasks();
		}
		expect(s.host.chunks.size).toBe(12);
		const sequences = [...s.host.chunks.values()]
			.map((chunk) => chunk.descriptor.sequence)
			.sort((a, b) => a - b);
		expect(sequences).toEqual(Array.from({ length: 12 }, (_, index) => index));
		// The wire never carried more than windowSize unACKed commits at once.
		const progress = s.events.filter(
			(event): event is Extract<RecorderWorkerToClient, { t: "progress" }> =>
				event.t === "progress",
		);
		expect(Math.max(...progress.map((event) => event.inFlight))).toBeLessThanOrEqual(
			windowSize,
		);
	});
});

describe("soft buffer limit", () => {
	it("enters degraded with a quality event, then recovers once drained", async () => {
		const h = createRecorderHarness({
			config: {
				chunkTargetBytes: 40,
				softBufferBytes: 1_500,
				hardBufferBytes: 1_000_000,
				inFlightWindow: 2,
			},
		});
		await h.start();
		const handle = h.sink.openStream(eegDraft);
		await h.settle();

		h.host.pause();
		// Each 10-row chunk encodes to ~500+ bytes; a few exceed 1500 soft.
		for (let batch = 0; batch < 6; batch++) {
			handle.pushRegular(samples(10, batch * 10), 10, batch * 10, batch * 100_000);
		}
		await h.settle();
		expect(h.core.state()).toBe("degraded");

		h.host.resume();
		await h.advance(2_000);
		expect(h.core.state()).toBe("recording");
		expect(h.host.chunks.size).toBe(6);
		// The quality event went to the host once the backlog drained.
		const quality = h.host.events.filter((event) => event.kind === "quality");
		expect(quality).toHaveLength(1);
		expect(quality[0].name).toBe("buffer.soft-limit");

		// State walked recording → degraded → recording.
		const states = h.eventsOf("state").map((event) => event.state);
		expect(states.slice(-2)).toEqual(["degraded", "recording"]);
	});
});

describe("hard buffer limit", () => {
	it("aborts the session with storage_stalled instead of dropping data", async () => {
		const h = createRecorderHarness({
			config: {
				chunkTargetBytes: 40,
				softBufferBytes: 600,
				hardBufferBytes: 2_000,
				inFlightWindow: 1,
			},
		});
		await h.start();
		const handle = h.sink.openStream(eegDraft);
		await h.settle();

		h.host.pause();
		for (let batch = 0; batch < 8; batch++) {
			handle.pushRegular(samples(10, batch * 10), 10, batch * 10, batch * 100_000);
		}
		await h.settle();
		expect(h.core.state()).toBe("aborted");
		const closed = h.eventsOf("closed");
		expect(closed).toHaveLength(1);
		expect(closed[0].summary.endReason).toBe("storage_stalled");

		// The host processes the held abort once resumed.
		h.host.resume();
		await h.settle();
		expect(h.host.sessions.get("mh-1")).toMatchObject({
			state: "aborted",
			endReason: "storage_stalled",
		});
	});
});
