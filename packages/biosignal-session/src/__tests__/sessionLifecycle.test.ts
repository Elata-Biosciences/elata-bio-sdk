/**
 * End-to-end vertical slice: syntheticSource → recorderCore → wire protocol
 * → memoryHost. Exact chunk/sample counts, checksum equality, ground-truth
 * content checks, and the finalize summary.
 */

import { crc32cHex } from "../arrow/checksum";
import { decodeChunk, readFloat32Column } from "../arrow/decode";
import { createRecorderHarness } from "../testing/recorderHarness";
import { createSyntheticSource } from "../testing/syntheticSource";

const EEG_LAST_SAMPLE_US = Math.round((30_719 * 1_000_000) / 256);

describe("120 s synthetic session", () => {
	// One shared run — build once, assert many times.
	let h: ReturnType<typeof createRecorderHarness>;
	let streamIdByModality: Record<string, string>;

	beforeAll(async () => {
		h = createRecorderHarness();
		const source = createSyntheticSource({ seed: 42 });
		await h.start();
		await h.startSource(source);
		for (let slice = 0; slice < 4; slice++) {
			source.pump(30_000);
			await h.advance(30_000);
		}
		await source.stop();
		await h.finalize();
		streamIdByModality = {};
		for (const stream of h.host.streams.values()) {
			streamIdByModality[stream.modality] = stream.streamId;
		}
	});

	it("completes with endReason finalized and the exact session endUs", () => {
		expect(h.core.state()).toBe("complete");
		const session = h.host.sessions.get("mh-1");
		expect(session).toMatchObject({ state: "complete", endReason: "finalized" });
		expect(session?.endUs).toBe(EEG_LAST_SAMPLE_US);
	});

	it("opened three streams and closed them all", () => {
		expect(Object.keys(streamIdByModality).sort()).toEqual([
			"eeg",
			"ppg-metrics",
			"rppg-metrics",
		]);
		for (const stream of h.host.streams.values()) {
			expect(stream.state).toBe("closed");
		}
	});

	it("committed exactly 4 EEG chunks of 7680 rows (30 s cap at 256 Hz)", () => {
		const chunks = h.host.chunksForStream(streamIdByModality.eeg);
		expect(chunks.map((chunk) => chunk.descriptor.sequence)).toEqual([0, 1, 2, 3]);
		expect(chunks.map((chunk) => chunk.descriptor.rowCount)).toEqual([
			7680, 7680, 7680, 7680,
		]);
		expect(chunks.map((chunk) => chunk.descriptor.sampleIndexStart)).toEqual([
			0, 7680, 15360, 23040,
		]);
		const total = chunks.reduce((sum, c) => sum + c.descriptor.rowCount, 0);
		expect(total).toBe(30_720); // 120 s × 256 Hz exactly
		expect(chunks[3].descriptor.endUs).toBe(EEG_LAST_SAMPLE_US);
	});

	it("committed exactly 4 rppg-metrics chunks (30 rows each) and 4 ppg chunks (15 rows)", () => {
		const rppg = h.host.chunksForStream(streamIdByModality["rppg-metrics"]);
		expect(rppg.map((chunk) => chunk.descriptor.rowCount)).toEqual([30, 30, 30, 30]);
		const ppg = h.host.chunksForStream(streamIdByModality["ppg-metrics"]);
		expect(ppg.map((chunk) => chunk.descriptor.rowCount)).toEqual([15, 15, 15, 15]);
	});

	it("every committed chunk's checksum re-verifies over the stored bytes", () => {
		expect(h.host.chunks.size).toBe(12);
		for (const chunk of h.host.chunks.values()) {
			expect(crc32cHex(chunk.payload as Uint8Array)).toBe(
				chunk.descriptor.checksum.value,
			);
		}
	});

	it("chunks decode in isolation with self-identifying metadata", () => {
		const chunks = h.host.chunksForStream(streamIdByModality.eeg);
		const decoded = decodeChunk(chunks[1].payload as Uint8Array);
		expect(decoded.rowCount).toBe(7680);
		expect(decoded.identity).toEqual({
			sessionId: "mh-1",
			streamId: streamIdByModality.eeg,
			arrowSchemaId: "regular-wide-f32@1",
		});
		expect(decoded.columnNames).toEqual(["EEG1", "EEG2", "EEG3", "EEG4"]);
	});

	it("reproduces the alpha-epoch ground truth: eyes-closed power ≫ eyes-open", () => {
		const chunks = h.host.chunksForStream(streamIdByModality.eeg);
		const rms = (payload: Uint8Array): number => {
			const column = readFloat32Column(decodeChunk(payload).table, "EEG1");
			let mean = 0;
			for (const value of column) mean += value;
			mean /= column.length;
			let power = 0;
			for (const value of column) power += (value - mean) ** 2;
			return Math.sqrt(power / column.length);
		};
		const openRms = rms(chunks[0].payload as Uint8Array); // epoch 0
		const closedRms = rms(chunks[1].payload as Uint8Array); // epoch 1
		expect(closedRms).toBeGreaterThan(openRms * 1.5);
	});

	it("records the heart-rate ramp in the rppg-metrics rows", () => {
		const chunks = h.host.chunksForStream(streamIdByModality["rppg-metrics"]);
		const first = decodeChunk(chunks[0].payload as Uint8Array).table;
		const last = decodeChunk(chunks[3].payload as Uint8Array).table;
		expect(Number(first.getChild("bpm")?.get(0))).toBeCloseTo(60, 5);
		const lastBpm = Number(last.getChild("bpm")?.get(29));
		expect(lastBpm).toBeCloseTo(60 + 20 * (119 / 120), 1);
		expect(Number(first.getChild("time_us")?.get(1))).toBe(1_000_000);
	});

	it("stored the epoch marker events and clock observations", () => {
		const markers = h.host.events.filter((event) => event.kind === "marker");
		expect(markers.map((event) => event.name)).toEqual([
			"epoch.eyes-open",
			"epoch.eyes-closed",
			"epoch.eyes-open",
			"epoch.eyes-closed",
		]);
		const device = h.host.observations.filter(
			(obs) => obs.kind === "device-clock",
		);
		const utc = h.host.observations.filter((obs) => obs.kind === "utc-check");
		expect(device).toHaveLength(12); // every 10 s over 120 s
		expect(utc).toHaveLength(2); // 0 s and 60 s
	});

	it("reported an exact closed summary", () => {
		const closed = h.eventsOf("closed");
		expect(closed).toHaveLength(1);
		expect(closed[0].summary).toEqual({
			sessionId: "mh-1",
			endUs: EEG_LAST_SAMPLE_US,
			totalChunks: 12,
			totalBytes: h.host.committedBytes(),
			endReason: "finalized",
		});
		const session = h.host.sessions.get("mh-1");
		expect(session?.stats.totalChunks).toBe(12);
		expect(session?.stats.streamCount).toBe(3);
	});
});
