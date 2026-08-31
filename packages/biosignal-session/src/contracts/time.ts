/**
 * Time model.
 *
 * Canonical session time is integer microseconds since the session anchor.
 * The anchor is a `(Date.now(), performance.now())` pair captured in one
 * synchronous block on the client UI thread at session creation. Only the
 * thread that owns source callbacks assigns timestamps — workers have their
 * own `timeOrigin` and must never call `performance.now()` for data time.
 *
 * Wall clock (`Date.now()`) is a human anchor and audit signal only; device
 * clocks are captured as alignment observations, never used to rewrite
 * canonical time.
 */

/** Integer microseconds since the session anchor. */
export type SessionUs = number;

export interface SessionClockAnchor {
	/** `Date.now()` at the anchor instant (human/UTC anchor). */
	startedAtUtcMs: number;
	/** `performance.now()` at the same instant on the client UI thread. */
	startedAtMonotonicMs: number;
}

export interface SessionClock {
	readonly anchor: SessionClockAnchor;
	/** Current session time in integer microseconds. */
	nowUs(): SessionUs;
}

/**
 * Create a session clock. `monotonicNow` defaults to `performance.now` and is
 * injectable for tests (fake clocks) — pass the same function that produced
 * `anchor.startedAtMonotonicMs`.
 */
export function createSessionClock(
	anchor: SessionClockAnchor,
	monotonicNow: () => number = () => performance.now(),
): SessionClock {
	return {
		anchor,
		nowUs() {
			return toSessionUs(monotonicNow(), anchor);
		},
	};
}

/** Capture a new anchor pair in one synchronous block. */
export function captureClockAnchor(
	utcNow: () => number = () => Date.now(),
	monotonicNow: () => number = () => performance.now(),
): SessionClockAnchor {
	// Both reads happen back to back inside one microtask.
	const startedAtUtcMs = utcNow();
	const startedAtMonotonicMs = monotonicNow();
	return { startedAtUtcMs, startedAtMonotonicMs };
}

/** Convert a monotonic-ms reading into integer session microseconds. */
export function toSessionUs(
	monotonicMs: number,
	anchor: SessionClockAnchor,
): SessionUs {
	return Math.round((monotonicMs - anchor.startedAtMonotonicMs) * 1000);
}

/** Derived per-sample time for regular streams: `timeUs0 + i / rate`. */
export function sampleTimeUs(
	timeUs0: SessionUs,
	sampleOffset: number,
	sampleRateHz: number,
): SessionUs {
	return timeUs0 + Math.round((sampleOffset * 1_000_000) / sampleRateHz);
}

/** One sample period, in integer microseconds. */
export function samplePeriodUs(sampleRateHz: number): number {
	return Math.round(1_000_000 / sampleRateHz);
}

/**
 * A gap/overlap/clock anomaly in a stream's timeline. Recorded on the next
 * chunk's `discontinuityBefore` and as a `discontinuity` session event.
 * Samples are never interpolated across a discontinuity.
 */
export interface DiscontinuityV1 {
	kind: "gap" | "overlap" | "clock-jump" | "dropout";
	expectedStartUs: SessionUs;
	actualStartUs: SessionUs;
	/** For regular streams: how many samples the counter jumped by. */
	missingSamples?: number;
	reason?: "ble-reconnect" | "page-hidden" | "source-stall" | "unknown";
}

/**
 * A raw clock observation enabling offline alignment/drift audit.
 * `device-clock` pairs a device-reported timestamp with canonical session
 * time; `utc-check` pairs `Date.now()` with session time to detect NTP steps
 * and suspend gaps.
 */
export interface ClockAlignmentObservationV1 {
	schemaVersion: 1;
	sessionId: string;
	sourceId: string;
	streamId?: string;
	kind: "device-clock" | "utc-check";
	/** Canonical session time at the observation. */
	observedAtUs: SessionUs;
	/** Last device timestamp of the observed block (kind `device-clock`). */
	deviceTimestampMs?: number;
	/** `Date.now()` at the observation (kind `utc-check`). */
	utcMs?: number;
	/** Transport sequence id for cross-reference, when available. */
	sequenceId?: number;
}

/** Cadence constants for automatic clock observations. */
export const CLOCK_OBSERVATION_INTERVALS = {
	deviceClockMs: 10_000,
	utcCheckMs: 60_000,
} as const;
