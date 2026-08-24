import { decodeChunk, readFloat32Column } from "../arrow/decode";
import type { StreamDescriptorDraft } from "../contracts/session";
import { createLoopbackPortPair } from "../testing/memoryHost";
import { createRecorderHarness } from "../testing/recorderHarness";

const eegDraft = (channels = 2, sampleRateHz = 100): StreamDescriptorDraft => ({
	sourceId: "src",
	modality: "eeg",
	sampling: "regular",
	sampleRateHz,
	channels: Array.from({ length: channels }, (_, index) => ({
		name: `ch${index + 1}`,
	})),
	encoding: "arrow-ipc",
	arrowSchemaId: "regular-wide-f32@1",
	layout: "wide",
	clockSource: "local",
});

const rppgDraft: StreamDescriptorDraft = {
	sourceId: "src",
	modality: "rppg-metrics",
	sampling: "irregular",
	channels: [],
	encoding: "arrow-ipc",
	arrowSchemaId: "rppg-metrics@1",
	layout: "wide",
	clockSource: "local",
};

function rows(count: number, channels: number, base = 0): Float32Array {
	const data = new Float32Array(count * channels);
	for (let i = 0; i < data.length; i++) data[i] = base + i;
	return data;
}

describe("handshake and session start", () => {
	it("walks idle → handshaking → ready → creating → recording", async () => {
		const h = createRecorderHarness();
		await h.start();
		expect(
			h.eventsOf("state").map((event) => event.state),
		).toEqual(["handshaking", "ready", "creating", "recording"]);
		expect(h.core.sessionId()).toBe("mh-1");
		expect(h.host.sessions.get("mh-1")?.state).toBe("recording");
	});

	it("rejects a duplicate init", async () => {
		const h = createRecorderHarness();
		await h.start();
		const [extraPort] = createLoopbackPortPair();
		h.core.handle({ t: "init", port: extraPort });
		expect(h.eventsOf("error").at(-1)).toMatchObject({
			code: "internal",
			detail: expect.stringContaining("duplicate init"),
		});
	});

	it("rejects session/start before the handshake completed", () => {
		const h = createRecorderHarness();
		h.core.handle({
			t: "session/stop",
			mode: "finalize",
		});
		expect(h.eventsOf("error").at(-1)).toMatchObject({ code: "bad_state" });
	});
});

describe("stream open and chunk flow", () => {
	it("opens a stream deferred until the session id exists, then commits chunks", async () => {
		const h = createRecorderHarness({
			config: { chunkTargetBytes: 80 }, // 2ch → 10 rows per chunk
		});
		await h.start();
		const handle = h.sink.openStream(eegDraft());
		await h.settle();
		const opened = h.eventsOf("stream-open");
		expect(opened).toHaveLength(1);
		const hostStreamId = opened[0].streamId;

		handle.pushRegular(rows(25, 2), 25, 0, 0);
		await h.settle();

		const committed = h.host.chunksForStream(hostStreamId);
		expect(committed.map((chunk) => chunk.descriptor.sequence)).toEqual([0, 1]);
		expect(committed[0].descriptor.rowCount).toBe(10);
		expect(committed[0].descriptor.sampleIndexStart).toBe(0);
		expect(committed[1].descriptor.sampleIndexStart).toBe(10);

		// The committed payload decodes in isolation with intact identity.
		const decoded = decodeChunk(committed[0].payload as Uint8Array);
		expect(decoded.rowCount).toBe(10);
		expect(decoded.identity.streamId).toBe(hostStreamId);
		expect(Array.from(readFloat32Column(decoded.table, "ch1"))).toEqual([
			0, 2, 4, 6, 8, 10, 12, 14, 16, 18,
		]);

		const progress = h.eventsOf("progress").at(-1);
		expect(progress).toMatchObject({ committedChunks: 2, inFlight: 0 });
		expect(progress?.usage).toBeDefined();
	});

	it("commits metric rows through the rows path", async () => {
		const h = createRecorderHarness();
		await h.start();
		const handle = h.sink.openStream(rppgDraft);
		await h.settle();
		handle.pushMetricRow(0, { bpm: 61, confidence: 0.9, signal_quality: 0.8 });
		handle.pushMetricRow(1_000_000, { bpm: 62, confidence: 0.9, signal_quality: 0.8 });
		h.core.handle({ t: "flush" });
		await h.settle();
		const hostStreamId = h.eventsOf("stream-open")[0].streamId;
		const committed = h.host.chunksForStream(hostStreamId);
		expect(committed).toHaveLength(1);
		expect(committed[0].descriptor.rowCount).toBe(2);
		const decoded = decodeChunk(committed[0].payload as Uint8Array);
		expect(decoded.identity.arrowSchemaId).toBe("rppg-metrics@1");
		expect(Number(decoded.table.getChild("bpm")?.get(1))).toBeCloseTo(62);
	});

	it("commits irregular numeric rows keyed by channel name", async () => {
		const h = createRecorderHarness();
		await h.start();
		const handle = h.sink.openStream({
			sourceId: "src",
			modality: "battery",
			sampling: "irregular",
			channels: [{ name: "battery_pct" }],
			encoding: "arrow-ipc",
			arrowSchemaId: "battery@1",
			layout: "wide",
			clockSource: "device",
		});
		await h.settle();
		handle.pushIrregular(
			new Float64Array([5_000, 65_000]),
			new Float32Array([98.5, 98.0]),
			2,
		);
		h.core.handle({ t: "flush" });
		await h.settle();
		const hostStreamId = h.eventsOf("stream-open")[0].streamId;
		const committed = h.host.chunksForStream(hostStreamId);
		// 65 000 µs is still within the 30 s duration bound → one chunk.
		expect(committed).toHaveLength(1);
		const decoded = decodeChunk(committed[0].payload as Uint8Array);
		expect(Number(decoded.table.getChild("battery_pct")?.get(0))).toBeCloseTo(98.5);
		expect(Number(decoded.table.getChild("time_us")?.get(1))).toBe(65_000);
	});

	it("emits a discontinuity session event alongside the chunk metadata", async () => {
		const h = createRecorderHarness();
		await h.start();
		const handle = h.sink.openStream(eegDraft(1, 100));
		await h.settle();
		handle.pushRegular(rows(5, 1), 5, 0, 0);
		handle.hintDiscontinuity?.("ble-reconnect");
		handle.pushRegular(rows(5, 1), 5, 5, 500_000); // 450 ms gap
		h.core.handle({ t: "flush" });
		await h.settle();
		const discontinuityEvents = h.host.events.filter(
			(event) => event.kind === "discontinuity",
		);
		expect(discontinuityEvents).toHaveLength(1);
		expect(discontinuityEvents[0].payload).toMatchObject({
			kind: "gap",
			reason: "ble-reconnect",
			missingSamples: 45,
		});
		const hostStreamId = h.eventsOf("stream-open")[0].streamId;
		const chunks = h.host.chunksForStream(hostStreamId);
		expect(chunks[1].descriptor.discontinuityBefore).toMatchObject({
			kind: "gap",
			missingSamples: 45,
		});
	});
});

describe("events and clock observations", () => {
	it("forwards events and clock observations to the host", async () => {
		const h = createRecorderHarness();
		await h.start();
		h.sink.event({ timestampUs: 10, kind: "marker", name: "epoch.start" });
		h.sink.clockObservation({
			sourceId: "src",
			kind: "utc-check",
			observedAtUs: 10,
			utcMs: 1_700_000_000_500,
		});
		await h.settle();
		expect(h.host.events).toHaveLength(1);
		expect(h.host.events[0].name).toBe("epoch.start");
		expect(h.host.observations).toHaveLength(1);
	});
});

describe("finalize and abort", () => {
	it("finalize flushes, closes streams, and completes with an exact summary", async () => {
		const h = createRecorderHarness();
		await h.start();
		const handle = h.sink.openStream(eegDraft(1, 100));
		await h.settle();
		handle.pushRegular(rows(50, 1), 50, 0, 0);
		await h.finalize();

		expect(h.core.state()).toBe("complete");
		const hostStreamId = h.eventsOf("stream-open")[0].streamId;
		expect(h.host.streams.get(hostStreamId)?.state).toBe("closed");
		const session = h.host.sessions.get("mh-1");
		expect(session).toMatchObject({ state: "complete", endReason: "finalized" });
		expect(session?.endUs).toBe(490_000); // sample 49 at 100 Hz
		const closed = h.eventsOf("closed");
		expect(closed).toHaveLength(1);
		expect(closed[0].summary).toMatchObject({
			sessionId: "mh-1",
			endReason: "finalized",
			totalChunks: 1,
			endUs: 490_000,
		});
	});

	it("abort marks the session aborted at the host", async () => {
		const h = createRecorderHarness();
		await h.start();
		h.core.handle({ t: "session/stop", mode: "abort", reason: "user-cancel" });
		await h.settle();
		expect(h.core.state()).toBe("aborted");
		expect(h.host.sessions.get("mh-1")?.state).toBe("aborted");
		expect(h.eventsOf("closed")[0].summary.endReason).toBe("user-cancel");
	});

	it("a session-invalidated notice aborts the client", async () => {
		const h = createRecorderHarness();
		await h.start();
		h.host.notify("session-invalidated", "mh-1");
		await h.settle();
		expect(h.core.state()).toBe("aborted");
		expect(h.eventsOf("error").at(-1)).toMatchObject({
			code: "session_invalidated",
		});
	});
});

describe("heartbeat", () => {
	it("pings on the heartbeat cadence while recording", async () => {
		const h = createRecorderHarness();
		await h.start();
		const before = h.host.sentReplies.length;
		await h.advance(10_000);
		await h.advance(10_000);
		// Each heartbeat ping produced one ok reply.
		expect(h.host.sentReplies.length).toBe(before + 2);
	});
});
