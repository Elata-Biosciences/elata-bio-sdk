import { createFakeClock } from "../testing/fakeClock";
import { createRowBuffer, createSampleBuffer } from "../worker/sampleBuffer";

/** Row-major batch where value = row * 10 + channel (transpose-checkable). */
function batch(rows: number, channels: number, base = 0): Float32Array {
	const data = new Float32Array(rows * channels);
	for (let row = 0; row < rows; row++) {
		for (let channel = 0; channel < channels; channel++) {
			data[row * channels + channel] = (base + row) * 10 + channel;
		}
	}
	return data;
}

describe("capacity policy", () => {
	it("derives rows per chunk from the byte target when it binds first", () => {
		// 1 channel @ 1000 Hz, 64-byte target → 16 rows; duration cap 30 s → 30000.
		const buffer = createSampleBuffer({
			channelCount: 1,
			sampleRateHz: 1000,
			chunkTargetBytes: 64,
		});
		expect(buffer.capacityRows()).toBe(16);
	});

	it("derives rows per chunk from the 30 s duration cap for low-rate EEG", () => {
		// 4ch @ 256 Hz: byte cap 16384 rows, duration cap 7680 rows → 7680.
		const buffer = createSampleBuffer({ channelCount: 4, sampleRateHz: 256 });
		expect(buffer.capacityRows()).toBe(7680);
	});
});

describe("transpose and chunk emission", () => {
	it("transposes row-major batches into per-channel columns", () => {
		const buffer = createSampleBuffer({
			channelCount: 2,
			sampleRateHz: 100,
		});
		expect(buffer.pushRegular(batch(3, 2), 3, 0, 0)).toHaveLength(0);
		const chunk = buffer.flush();
		expect(chunk?.rowCount).toBe(3);
		expect(Array.from(chunk?.channelColumns[0] ?? [])).toEqual([0, 10, 20]);
		expect(Array.from(chunk?.channelColumns[1] ?? [])).toEqual([1, 11, 21]);
		expect(chunk?.sampleIndexStart).toBe(0);
		expect(chunk?.startUs).toBe(0);
		expect(chunk?.endUs).toBe(20_000); // 2 samples later at 100 Hz
	});

	it("closes chunks exactly at capacity and carries times across batches", () => {
		const buffer = createSampleBuffer({
			channelCount: 1,
			sampleRateHz: 1000,
			chunkTargetBytes: 40, // 10 rows per chunk
		});
		const chunks = [
			...buffer.pushRegular(batch(7, 1), 7, 0, 0),
			...buffer.pushRegular(batch(7, 1, 7), 7, 7, 7_000),
		];
		expect(chunks).toHaveLength(1);
		expect(chunks[0].rowCount).toBe(10);
		expect(chunks[0].sampleIndexStart).toBe(0);
		expect(chunks[0].startUs).toBe(0);
		expect(chunks[0].endUs).toBe(9_000);
		expect(buffer.stats().bufferedRows).toBe(4);
		const tail = buffer.flush();
		expect(tail?.sampleIndexStart).toBe(10);
		expect(tail?.startUs).toBe(10_000);
		expect(tail?.endUs).toBe(13_000);
	});

	it("splits one oversized batch into several exact chunks", () => {
		const buffer = createSampleBuffer({
			channelCount: 1,
			sampleRateHz: 1000,
			chunkTargetBytes: 16, // 4 rows per chunk
		});
		const chunks = buffer.pushRegular(batch(10, 1), 10, 0, 0);
		expect(chunks.map((chunk) => chunk.rowCount)).toEqual([4, 4]);
		expect(chunks.map((chunk) => chunk.sampleIndexStart)).toEqual([0, 4]);
		expect(buffer.stats().bufferedRows).toBe(2);
	});

	it("ignores empty pushes and returns null flush on an empty buffer", () => {
		const buffer = createSampleBuffer({ channelCount: 1, sampleRateHz: 100 });
		expect(buffer.pushRegular(new Float32Array(0), 0, 0, 0)).toEqual([]);
		expect(buffer.flush()).toBeNull();
	});

	it("rejects a batch shorter than rows×channels", () => {
		const buffer = createSampleBuffer({ channelCount: 2, sampleRateHz: 100 });
		expect(() => buffer.pushRegular(new Float32Array(3), 2, 0, 0)).toThrow(
			/batch too short/,
		);
	});
});

describe("nominal timeline and jitter", () => {
	it("keeps nominal times when arrivals jitter within two periods", () => {
		const buffer = createSampleBuffer({ channelCount: 1, sampleRateHz: 100 });
		buffer.pushRegular(batch(10, 1), 10, 0, 0);
		// Expected next start = 100 000 µs; arrive 15 ms late (< 2 × 10 ms).
		buffer.pushRegular(batch(10, 1), 10, 10, 115_000);
		const chunk = buffer.flush();
		expect(chunk?.discontinuityBefore).toBeUndefined();
		expect(chunk?.startUs).toBe(0);
		expect(chunk?.endUs).toBe(190_000); // still the nominal timeline
		expect(buffer.stats().discontinuityCount).toBe(0);
	});
});

describe("discontinuities", () => {
	it("records a gap with missing samples when arrival is late by > 2 periods", () => {
		const buffer = createSampleBuffer({ channelCount: 1, sampleRateHz: 100 });
		buffer.pushRegular(batch(10, 1), 10, 0, 0);
		// Expected 100 000, actual 130 000 → 30 ms late = 3 samples missing.
		const closed = buffer.pushRegular(batch(5, 1), 5, 10, 130_000);
		expect(closed).toHaveLength(1); // partial run flushed
		expect(closed[0].discontinuityBefore).toBeUndefined();
		const next = buffer.flush();
		expect(next?.discontinuityBefore).toEqual({
			kind: "gap",
			expectedStartUs: 100_000,
			actualStartUs: 130_000,
			missingSamples: 3,
			reason: "unknown",
		});
		expect(next?.sampleIndexStart).toBe(13); // counter jumped by 3
		expect(next?.startUs).toBe(130_000);
		expect(buffer.stats().discontinuityCount).toBe(1);
	});

	it("attributes the gap with a hinted reason and marks source stalls as dropout", () => {
		const buffer = createSampleBuffer({ channelCount: 1, sampleRateHz: 100 });
		buffer.pushRegular(batch(2, 1), 2, 0, 0);
		buffer.hintDiscontinuity("ble-reconnect");
		buffer.pushRegular(batch(1, 1), 1, 2, 100_000);
		expect(buffer.flush()?.discontinuityBefore?.reason).toBe("ble-reconnect");

		const stalled = createSampleBuffer({ channelCount: 1, sampleRateHz: 100 });
		stalled.pushRegular(batch(2, 1), 2, 0, 0);
		stalled.hintDiscontinuity("source-stall");
		stalled.pushRegular(batch(1, 1), 1, 2, 100_000);
		const chunk = stalled.flush();
		expect(chunk?.discontinuityBefore?.kind).toBe("dropout");
		expect(chunk?.discontinuityBefore?.reason).toBe("source-stall");
	});

	it("clears a hint after the next push even without a discontinuity", () => {
		const buffer = createSampleBuffer({ channelCount: 1, sampleRateHz: 100 });
		buffer.pushRegular(batch(2, 1), 2, 0, 0);
		buffer.hintDiscontinuity("ble-reconnect");
		buffer.pushRegular(batch(2, 1), 2, 2, 20_000); // on time
		buffer.pushRegular(batch(1, 1), 1, 4, 400_000); // now a real gap
		expect(buffer.flush()?.discontinuityBefore?.reason).toBe("unknown");
	});

	it("clamps a clock regression to prev + 1 µs and records clock-jump", () => {
		const buffer = createSampleBuffer({ channelCount: 1, sampleRateHz: 100 });
		buffer.pushRegular(batch(10, 1), 10, 0, 0);
		// Expected 100 000, actual 30 000 → regression of 70 ms.
		buffer.pushRegular(batch(5, 1), 5, 10, 30_000);
		const chunk = buffer.flush();
		expect(chunk?.discontinuityBefore).toEqual({
			kind: "clock-jump",
			expectedStartUs: 100_000,
			actualStartUs: 90_001, // last sample was at 90 000
			reason: "unknown",
		});
		// No samples were lost — the counter continues without a jump.
		expect(chunk?.sampleIndexStart).toBe(10);
		expect(chunk?.startUs).toBe(90_001);
		expect(chunk?.endUs).toBe(90_001 + 40_000);
	});
});

describe("deterministic chunk counts with a fake clock", () => {
	it("produces exactly 4 chunks for 120 s of 4ch/256 Hz EEG in 250 ms batches", () => {
		const clock = createFakeClock();
		const startMonotonicMs = clock.monotonicNow();
		const buffer = createSampleBuffer({ channelCount: 4, sampleRateHz: 256 });
		const chunks = [];
		let sampleIndex = 0;
		for (let batchIndex = 0; batchIndex < 480; batchIndex++) {
			// 250 ms of 256 Hz = 64 rows per batch.
			const timeUs0 = Math.round(
				(clock.monotonicNow() - startMonotonicMs) * 1000,
			);
			chunks.push(...buffer.pushRegular(batch(64, 4), 64, sampleIndex, timeUs0));
			sampleIndex += 64;
			clock.advance(250);
		}
		expect(buffer.flush()).toBeNull(); // 30720 rows = 4 × 7680 exactly
		expect(chunks).toHaveLength(4);
		expect(chunks.map((chunk) => chunk.rowCount)).toEqual([
			7680, 7680, 7680, 7680,
		]);
		expect(chunks.map((chunk) => chunk.sampleIndexStart)).toEqual([
			0, 7680, 15360, 23040,
		]);
		expect(chunks[0].startUs).toBe(0);
		expect(chunks[0].endUs).toBe(Math.round((7679 * 1_000_000) / 256));
		expect(chunks[3].endUs).toBe(Math.round((30719 * 1_000_000) / 256));
		expect(buffer.stats().nextSampleIndex).toBe(30720);
	});
});

describe("row buffer (metric and irregular streams)", () => {
	it("embeds time_us and closes on the 30 s duration boundary", () => {
		const buffer = createRowBuffer();
		const chunks = [];
		for (let second = 0; second < 60; second++) {
			chunks.push(...buffer.push(second * 1_000_000, { bpm: 60 + second }));
		}
		expect(chunks).toHaveLength(1);
		expect(chunks[0].rowCount).toBe(30);
		expect(chunks[0].startUs).toBe(0);
		expect(chunks[0].endUs).toBe(29_000_000);
		expect(chunks[0].rows[0]).toEqual({ bpm: 60, time_us: 0 });
		const tail = buffer.flush();
		expect(tail?.rowCount).toBe(30);
		expect(tail?.startUs).toBe(30_000_000);
	});

	it("closes on the row cap as well", () => {
		const buffer = createRowBuffer({ maxRows: 3 });
		expect(buffer.push(0, { v: 1 })).toEqual([]);
		expect(buffer.push(1, { v: 2 })).toEqual([]);
		const closed = buffer.push(2, { v: 3 });
		expect(closed).toHaveLength(1);
		expect(closed[0].rowCount).toBe(3);
		expect(buffer.bufferedRows()).toBe(0);
		expect(buffer.flush()).toBeNull();
	});
});
