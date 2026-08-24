/**
 * Per-stream accumulators that turn pushed batches into bounded chunks.
 *
 * Regular streams: row-major sample batches are transposed at append time
 * into per-channel Float32 columns (the wide layout). A chunk closes at the
 * 256 KiB byte target or the 30 s duration cap, whichever yields fewer rows
 * (`BIOSIGNAL_LIMITS`), so chunk row counts are exact and deterministic.
 *
 * Time model (contracts/time): the buffer owns the canonical absolute sample
 * counter and the nominal per-run timeline. An arrival deviating more than
 * two sample periods from the nominal timeline closes the run and records a
 * `DiscontinuityV1` (`gap`/`dropout` forward, monotonic-clamped `clock-jump`
 * backward). Samples are never interpolated across a discontinuity.
 */

import { BIOSIGNAL_LIMITS } from "../protocol/messages";
import type { DiscontinuityV1, SessionUs } from "../contracts/time";

export interface SampleChunk {
	channelColumns: Float32Array[];
	rowCount: number;
	startUs: SessionUs;
	endUs: SessionUs;
	sampleIndexStart: number;
	discontinuityBefore?: DiscontinuityV1;
}

export interface SampleBufferConfig {
	channelCount: number;
	sampleRateHz: number;
	chunkTargetBytes?: number;
	chunkMaxDurationUs?: number;
}

export interface SampleBufferStats {
	bufferedRows: number;
	bufferedBytes: number;
	nextSampleIndex: number;
	lastSampleTimeUs: SessionUs | null;
	discontinuityCount: number;
}

export interface SampleBuffer {
	/**
	 * Append a row-major batch (`rowMajor[row * channelCount + channel]`).
	 * `sampleIndex0`/`timeUs0` describe the caller's first row; the buffer
	 * keeps its own canonical counter once started. Returns every chunk the
	 * batch closed (possibly none, possibly several).
	 */
	pushRegular(
		rowMajor: Float32Array,
		rows: number,
		sampleIndex0: number,
		timeUs0: SessionUs,
	): SampleChunk[];
	/** Attribute the next detected discontinuity (e.g. "ble-reconnect"). */
	hintDiscontinuity(reason: NonNullable<DiscontinuityV1["reason"]>): void;
	/** Close and return the current partial chunk, if any rows are buffered. */
	flush(): SampleChunk | null;
	stats(): SampleBufferStats;
	/** Rows per closed chunk under this configuration (exposed for tests). */
	capacityRows(): number;
}

export function createSampleBuffer(config: SampleBufferConfig): SampleBuffer {
	const { channelCount, sampleRateHz } = config;
	if (!(channelCount >= 1)) throw new Error("channelCount must be >= 1");
	if (!(sampleRateHz > 0)) throw new Error("sampleRateHz must be > 0");
	const chunkTargetBytes =
		config.chunkTargetBytes ?? BIOSIGNAL_LIMITS.chunkTargetBytes;
	const chunkMaxDurationUs =
		config.chunkMaxDurationUs ?? BIOSIGNAL_LIMITS.chunkMaxDurationUs;

	const bytesPerRow = channelCount * 4;
	const capacity = Math.max(
		1,
		Math.min(
			Math.floor(chunkTargetBytes / bytesPerRow),
			Math.floor((chunkMaxDurationUs * sampleRateHz) / 1_000_000),
		),
	);
	const periodUs = 1_000_000 / sampleRateHz;

	// Current run (nominal timeline anchor).
	let started = false;
	let anchorIndex = 0;
	let anchorTimeUs: SessionUs = 0;
	// Canonical absolute sample counter (next row to be appended).
	let nextIndex = 0;
	// Current chunk under construction.
	let columns: Float32Array[] = [];
	let filled = 0;
	let chunkStartIndex = 0;
	let pendingDiscontinuity: DiscontinuityV1 | undefined;
	let hint: NonNullable<DiscontinuityV1["reason"]> | undefined;
	let discontinuityCount = 0;

	const timeAt = (index: number): SessionUs =>
		anchorTimeUs +
		Math.round(((index - anchorIndex) * 1_000_000) / sampleRateHz);

	const ensureColumns = () => {
		if (columns.length === 0) {
			columns = Array.from(
				{ length: channelCount },
				() => new Float32Array(capacity),
			);
			chunkStartIndex = nextIndex;
		}
	};

	const closeChunk = (): SampleChunk => {
		const rowCount = filled;
		const complete = rowCount === capacity;
		const chunk: SampleChunk = {
			channelColumns: complete
				? columns
				: columns.map((column) => column.slice(0, rowCount)),
			rowCount,
			startUs: timeAt(chunkStartIndex),
			endUs: timeAt(chunkStartIndex + rowCount - 1),
			sampleIndexStart: chunkStartIndex,
			discontinuityBefore: pendingDiscontinuity,
		};
		pendingDiscontinuity = undefined;
		columns = [];
		filled = 0;
		return chunk;
	};

	return {
		pushRegular(rowMajor, rows, sampleIndex0, timeUs0) {
			if (rows <= 0) return [];
			if (rowMajor.length < rows * channelCount) {
				throw new Error(
					`batch too short: ${rowMajor.length} values for ${rows}×${channelCount}`,
				);
			}
			const closed: SampleChunk[] = [];
			const reason = hint;
			hint = undefined;

			if (!started) {
				started = true;
				anchorIndex = sampleIndex0;
				anchorTimeUs = timeUs0;
				nextIndex = sampleIndex0;
			} else {
				const expectedUs = timeAt(nextIndex);
				const deviationUs = timeUs0 - expectedUs;
				if (deviationUs > 2 * periodUs) {
					// Forward gap/dropout: the counter jumps, time re-anchors.
					if (filled > 0) closed.push(closeChunk());
					const missingSamples = Math.round(
						(deviationUs * sampleRateHz) / 1_000_000,
					);
					pendingDiscontinuity = {
						kind: reason === "source-stall" ? "dropout" : "gap",
						expectedStartUs: expectedUs,
						actualStartUs: timeUs0,
						missingSamples,
						reason: reason ?? "unknown",
					};
					discontinuityCount += 1;
					nextIndex += missingSamples;
					anchorIndex = nextIndex;
					anchorTimeUs = timeUs0;
				} else if (deviationUs < -2 * periodUs) {
					// Monotonic regression: clamp to just after the last sample.
					if (filled > 0) closed.push(closeChunk());
					const clampedUs = timeAt(nextIndex - 1) + 1;
					pendingDiscontinuity = {
						kind: "clock-jump",
						expectedStartUs: expectedUs,
						actualStartUs: clampedUs,
						reason: reason ?? "unknown",
					};
					discontinuityCount += 1;
					anchorIndex = nextIndex;
					anchorTimeUs = clampedUs;
				}
				// Small jitter: continue the nominal timeline untouched.
			}

			for (let row = 0; row < rows; row++) {
				ensureColumns();
				for (let channel = 0; channel < channelCount; channel++) {
					columns[channel][filled] = rowMajor[row * channelCount + channel];
				}
				filled += 1;
				nextIndex += 1;
				if (filled === capacity) closed.push(closeChunk());
			}
			return closed;
		},

		hintDiscontinuity(reason) {
			hint = reason;
		},

		flush() {
			if (filled === 0) return null;
			return closeChunk();
		},

		stats() {
			return {
				bufferedRows: filled,
				bufferedBytes: filled * bytesPerRow,
				nextSampleIndex: nextIndex,
				lastSampleTimeUs:
					started && nextIndex > 0 ? timeAt(nextIndex - 1) : null,
				discontinuityCount,
			};
		},

		capacityRows() {
			return capacity;
		},
	};
}

/**
 * Buffer for timestamped row objects (metric streams and irregular numeric
 * streams). Rows carry an explicit `time_us`; a chunk closes when a new row
 * lands at or past the duration cap from the chunk start, or when the row
 * cap is reached.
 */
export interface RowChunk {
	rows: Record<string, unknown>[];
	rowCount: number;
	startUs: SessionUs;
	endUs: SessionUs;
}

export interface RowBufferConfig {
	chunkMaxDurationUs?: number;
	maxRows?: number;
}

export interface RowBuffer {
	/** Returns every chunk this row closed (the row may start the next one). */
	push(timeUs: SessionUs, row: Record<string, unknown>): RowChunk[];
	flush(): RowChunk | null;
	bufferedRows(): number;
}

export const ROW_BUFFER_DEFAULT_MAX_ROWS = 4096;

export function createRowBuffer(config: RowBufferConfig = {}): RowBuffer {
	const chunkMaxDurationUs =
		config.chunkMaxDurationUs ?? BIOSIGNAL_LIMITS.chunkMaxDurationUs;
	const maxRows = config.maxRows ?? ROW_BUFFER_DEFAULT_MAX_ROWS;

	let rows: Record<string, unknown>[] = [];
	let times: SessionUs[] = [];

	const close = (): RowChunk => {
		const chunk: RowChunk = {
			rows,
			rowCount: rows.length,
			startUs: times[0],
			endUs: times[times.length - 1],
		};
		rows = [];
		times = [];
		return chunk;
	};

	return {
		push(timeUs, row) {
			const closed: RowChunk[] = [];
			if (rows.length > 0 && timeUs - times[0] >= chunkMaxDurationUs) {
				closed.push(close());
			}
			rows.push({ ...row, time_us: timeUs });
			times.push(timeUs);
			if (rows.length >= maxRows) closed.push(close());
			return closed;
		},

		flush() {
			if (rows.length === 0) return null;
			return close();
		},

		bufferedRows() {
			return rows.length;
		},
	};
}
