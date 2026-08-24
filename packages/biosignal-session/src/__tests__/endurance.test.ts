/**
 * Fast-clock endurance: 8 virtual hours of recording in seconds of real
 * time. Exact expected chunk counts per stream, contiguous sequences, and a
 * buffer highwater that stays below the soft limit throughout.
 *
 * Uses the cheap "simple" waveform (no pink noise) and a payload-discarding
 * memory host so the run is CPU/RAM-light while every protocol path — chunk
 * boundaries, ACK pacing, heartbeats, clock observations — runs for real.
 */

import { BIOSIGNAL_LIMITS } from "../protocol/messages";
import { createRecorderHarness } from "../testing/recorderHarness";
import { createSyntheticSource } from "../testing/syntheticSource";

const VIRTUAL_HOURS = 8;
const TOTAL_SECONDS = VIRTUAL_HOURS * 3600; // 28 800 s
const SLICE_SECONDS = 60;

jest.setTimeout(180_000);

describe("8 h virtual session", () => {
	it("produces exact chunk counts with a bounded buffer highwater", async () => {
		const h = createRecorderHarness({
			hostOptions: { retainPayloads: false },
		});
		const source = createSyntheticSource({
			seed: 1234,
			eeg: { channelCount: 1, waveform: "simple" },
			rppgMetrics: { rateHz: 1 },
			ppgMetrics: { rateHz: 0.5 },
		});
		await h.start();
		await h.startSource(source);

		let bufferHighwater = 0;
		for (let slice = 0; slice < TOTAL_SECONDS / SLICE_SECONDS; slice++) {
			source.pump(SLICE_SECONDS * 1000);
			await h.advance(SLICE_SECONDS * 1000);
			for (const event of h.events) {
				if (event.t === "progress") {
					bufferHighwater = Math.max(bufferHighwater, event.bufferedBytes);
				}
			}
			h.events.length = 0; // keep memory flat across 480 slices
		}
		await source.stop();
		await h.finalize();

		expect(h.core.state()).toBe("complete");

		const byModality: Record<string, { chunkCount: number; rowCount: number; expectedNextSequence: number }> = {};
		for (const stream of h.host.streams.values()) {
			byModality[stream.modality] = {
				chunkCount: stream.stats.chunkCount,
				rowCount: stream.stats.rowCount,
				expectedNextSequence: stream.expectedNextSequence,
			};
			expect(stream.state).toBe("closed");
		}

		// EEG: 28 800 s × 256 Hz = 7 372 800 samples; 30 s cap → 7680-row
		// chunks → exactly 960, sequences contiguous.
		expect(byModality.eeg).toEqual({
			chunkCount: 960,
			rowCount: 7_372_800,
			expectedNextSequence: 960,
		});
		// rppg-metrics: 28 800 rows at 1 Hz → 960 chunks of 30 rows.
		expect(byModality["rppg-metrics"]).toEqual({
			chunkCount: 960,
			rowCount: 28_800,
			expectedNextSequence: 960,
		});
		// ppg-metrics: 14 400 rows at 0.5 Hz → 960 chunks of 15 rows.
		expect(byModality["ppg-metrics"]).toEqual({
			chunkCount: 960,
			rowCount: 14_400,
			expectedNextSequence: 960,
		});

		const session = h.host.sessions.get("mh-1");
		expect(session?.stats.totalChunks).toBe(2880);
		expect(session?.state).toBe("complete");
		// Last committed sample: EEG sample 7 372 799 at 256 Hz.
		expect(session?.endUs).toBe(Math.round((7_372_799 * 1_000_000) / 256));

		// The client buffer never approached the soft limit — no degraded state.
		expect(bufferHighwater).toBeGreaterThan(0);
		expect(bufferHighwater).toBeLessThan(BIOSIGNAL_LIMITS.softBufferBytes);

		// Clock observations kept their cadence across the whole run.
		const device = h.host.observations.filter(
			(obs) => obs.kind === "device-clock",
		);
		const utc = h.host.observations.filter((obs) => obs.kind === "utc-check");
		expect(device).toHaveLength(TOTAL_SECONDS / 10);
		expect(utc).toHaveLength(TOTAL_SECONDS / 60);

		// Epoch markers: one per 30 s epoch boundary.
		expect(session?.stats.eventCount).toBe(TOTAL_SECONDS / 30);
	});
});
