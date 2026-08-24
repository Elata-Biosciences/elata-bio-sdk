/**
 * Test harness wiring a `RecorderCore` to an in-memory host over a loopback
 * port pair, on a fake linked clock. Also bridges the adapter-facing
 * `SourceSink` contract onto the engine's internal message surface so
 * `BiosignalSource` implementations (synthetic or real-shaped) can drive
 * end-to-end protocol tests without workers, IndexedDB, or OPFS.
 */

import type {
	BiosignalSource,
	SourceSink,
	StreamHandle,
} from "../adapters/types";
import { RecorderCore } from "../client/recorderCore";
import type {
	SessionEventDraft,
	SourceDescriptorDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import { createSessionClock } from "../contracts/time";
import type { SessionClock, SessionUs } from "../contracts/time";
import type { SessionCreateSpec } from "../protocol/messages";
import type {
	RecorderConfig,
	RecorderWorkerToClient,
} from "../worker/workerMessages";
import { createFakeClock } from "./fakeClock";
import type { FakeClock } from "./fakeClock";
import {
	createLoopbackPortPair,
	createMemoryHost,
	settleMicrotasks,
} from "./memoryHost";
import type { MemoryHost, MemoryHostOptions } from "./memoryHost";

export interface RecorderHarnessOptions {
	hostOptions?: MemoryHostOptions;
	config?: RecorderConfig;
	clock?: FakeClock;
}

export interface RecorderHarness {
	core: RecorderCore;
	host: MemoryHost;
	clock: FakeClock;
	/** Session clock anchored at `start()` (fake-clock driven). */
	sessionClock: SessionClock;
	/** Every engine emission, in order. */
	events: RecorderWorkerToClient[];
	eventsOf<T extends RecorderWorkerToClient["t"]>(
		t: T,
	): Extract<RecorderWorkerToClient, { t: T }>[];
	lastState(): string | undefined;
	/** init → handshake → session/create; resolves once recording. */
	start(spec?: Partial<SessionCreateSpec>): Promise<void>;
	/** A `SourceSink` bridged onto the engine (for `BiosignalSource`s). */
	sink: SourceSink;
	/** Run a source against the sink. */
	startSource(source: BiosignalSource): Promise<void>;
	/** Advance the fake clock, tick the engine, settle deliveries. */
	advance(ms: number): Promise<void>;
	/** Let in-flight loopback messages settle. */
	settle(): Promise<void>;
	/** Flush, close streams, finalize; resolves once complete. */
	finalize(): Promise<void>;
}

export const HARNESS_SOURCE: SourceDescriptorDraft = {
	kind: "synthetic",
	name: "harness",
	adapter: "synthetic@1",
	sdkPackages: [
		{ name: "@elata-biosciences/biosignal-session", version: "0.1.0" },
	],
};

export function createRecorderHarness(
	options: RecorderHarnessOptions = {},
): RecorderHarness {
	const clock = options.clock ?? createFakeClock();
	const host = createMemoryHost({
		nowMs: () => clock.monotonicNow(),
		nowUtcMs: () => clock.utcNow(),
		...options.hostOptions,
	});
	const [clientPort, hostPort] = createLoopbackPortPair();
	host.attach(hostPort);

	const events: RecorderWorkerToClient[] = [];
	const core = new RecorderCore({
		emit: (message) => events.push(message),
		now: () => clock.monotonicNow(),
		jitter: () => 0,
	});

	let anchorMonotonicMs = clock.monotonicNow();
	const sessionClock = () =>
		createSessionClock(
			{
				startedAtUtcMs: clock.utcNow(),
				startedAtMonotonicMs: anchorMonotonicMs,
			},
			() => clock.monotonicNow(),
		);
	let currentSessionClock = sessionClock();

	let streamCounter = 0;

	const sink: SourceSink = {
		clock: { nowUs: () => currentSessionClock.nowUs() },
		openStream(draft: StreamDescriptorDraft): StreamHandle {
			const clientStreamId = `cs-${++streamCounter}`;
			core.handle({ t: "stream/open", clientStreamId, draft });
			const channels = draft.channels.length;
			return {
				streamId: clientStreamId,
				pushRegular(rowMajor, rows, sampleIndex0, timeUs0) {
					core.handle({
						t: "samples",
						clientStreamId,
						sampleIndex0,
						timeUs0,
						rows,
						channels,
						data: rowMajor.slice().buffer,
					});
				},
				pushIrregular(timesUs, rowMajor, rows) {
					core.handle({
						t: "irregular",
						clientStreamId,
						rows,
						timesUs: timesUs.slice().buffer,
						data: rowMajor.slice().buffer,
					});
				},
				pushMetricRow(timeUs: SessionUs, row: Record<string, unknown>) {
					core.handle({ t: "metricRow", clientStreamId, timeUs, row });
				},
				hintDiscontinuity(reason) {
					core.handle({ t: "discontinuityHint", clientStreamId, reason });
				},
				close(endUs: SessionUs) {
					core.handle({ t: "stream/close", clientStreamId, endUs });
				},
			};
		},
		event(event: SessionEventDraft) {
			core.handle({ t: "event", events: [event] });
		},
		clockObservation(observation) {
			core.handle({ t: "clock", observations: [observation] });
		},
		status() {
			// Statuses are surfaced by real clients; the harness ignores them.
		},
	};

	const settle = () => settleMicrotasks();

	const harness: RecorderHarness = {
		core,
		host,
		clock,
		get sessionClock() {
			return currentSessionClock;
		},
		events,
		eventsOf(t) {
			return events.filter(
				(event): event is Extract<RecorderWorkerToClient, { t: typeof t }> =>
					event.t === t,
			) as never;
		},
		lastState() {
			for (let i = events.length - 1; i >= 0; i--) {
				const event = events[i];
				if (event.t === "state") return event.state;
			}
			return undefined;
		},
		async start(spec) {
			core.handle({ t: "init", port: clientPort, config: options.config });
			await settle();
			anchorMonotonicMs = clock.monotonicNow();
			currentSessionClock = sessionClock();
			core.handle({
				t: "session/start",
				spec: {
					startedAtUtcMs: clock.utcNow(),
					startedAtMonotonicMs: anchorMonotonicMs,
					sources: [HARNESS_SOURCE],
					provenance: {
						recorderVersion: "0.1.0",
						protocolVersion: 1,
						sdkPackages: [],
					},
					...spec,
				},
			});
			await settle();
		},
		sink,
		async startSource(source) {
			await source.start(sink);
			await settle();
		},
		async advance(ms) {
			// Sub-steps with settles between keep virtual time honest: an ACK
			// that is merely undelivered must not look like a 15 s timeout.
			let remaining = ms;
			while (remaining > 0) {
				await settle();
				const step = Math.min(remaining, 5_000);
				clock.advance(step);
				core.tick();
				remaining -= step;
			}
			await settle();
		},
		async settle() {
			await settle();
		},
		async finalize() {
			core.handle({ t: "session/stop", mode: "finalize" });
			await settle();
			// Retries may still be pending — advance virtual time so backoff
			// deadlines can pass, then tick until the finalize completes.
			for (let i = 0; i < 40 && core.state() === "finalizing"; i++) {
				clock.advance(500);
				core.tick();
				await settle();
			}
		},
	};
	return harness;
}
