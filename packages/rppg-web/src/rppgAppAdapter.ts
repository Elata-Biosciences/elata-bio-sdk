import {
	RppgGatingController,
	type RppgGatingOptions,
	type RppgGatingOutput,
} from "./rppgGating";
import {
	normalizeRppgError,
	type RppgNormalizedError,
	type RppgNormalizedErrorCode,
} from "./rppgErrors";
import type { ManagedRppgSessionState } from "./managedRppgSession";
import type {
	Metrics,
	RppgProcessorBackendFailure,
	RppgTraceSnapshot,
} from "./rppgProcessor";
import type {
	RppgSessionBackendMode,
	RppgSessionDiagnostics,
	RppgSessionError,
	RppgSessionFaceTrackingMode,
	RppgSessionIssueCode,
	RppgSessionState,
} from "./rppgSession";
import type { AffectState, FaceBlendshapeCategory } from "./affect";
import { AffectTracker, type AffectTrackerOptions } from "./affectTracker";

export type RppgAppStatus =
	| "idle"
	| "starting"
	| "retrying"
	| "running"
	| "ready"
	| "degraded"
	| "failed"
	| "stopped";

export type RppgAppGuidanceCode =
	| RppgNormalizedErrorCode
	| RppgGatingOutput["guidance"]["code"]
	| "starting"
	| "retrying"
	| "stopped";

export type RppgAppGuidance = {
	code: RppgAppGuidanceCode;
	message: string;
};

export type RppgAppAdapterSource = {
	state: RppgSessionState | ManagedRppgSessionState;
	lastError: RppgSessionError | null;
	getMetrics(): Metrics;
	getDiagnostics(): RppgSessionDiagnostics | null;
	getTraceSnapshot(maxPoints?: number): RppgTraceSnapshot;
	/** Latest face blendshapes (for affect). Optional — sources without face tracking omit it. */
	getLastBlendshapes?(): { blendshapes: FaceBlendshapeCategory[]; atMs: number } | null;
};

export type CreateRppgAppAdapterOptions = {
	maxTracePoints?: number;
	gating?: RppgGatingOptions;
	nowMs?: () => number;
	/** Affect (valence/arousal) estimation config. Pass `false` to disable. */
	affect?: AffectTrackerOptions | false;
};

export type RppgAppSnapshotListener = (snapshot: RppgAppSnapshot) => void;

export type CreateRppgAppMonitorOptions = CreateRppgAppAdapterOptions & {
	intervalMs?: number;
	emitImmediately?: boolean;
};

export type RppgAppSnapshot = {
	status: RppgAppStatus;
	ready: boolean;
	canPublish: boolean;
	publishBpm: number | null;
	message: string;
	guidance: RppgAppGuidance;
	metrics: Metrics;
	/** Dimensional affect: valence (face) + arousal (rPPG physiology fused with face). Null when disabled/unavailable. */
	affect: AffectState | null;
	diagnostics: RppgSessionDiagnostics | null;
	trace: RppgTraceSnapshot;
	normalizedError: RppgNormalizedError | null;
	sessionState: RppgSessionState | null;
	managedState: ManagedRppgSessionState | null;
	gating: RppgGatingOutput;
	debug: {
		backendMode: RppgSessionBackendMode | null;
		faceTrackingMode: RppgSessionFaceTrackingMode | null;
		issues: RppgSessionIssueCode[];
		processorFailure: RppgProcessorBackendFailure | null;
		retryCount: number;
		nextRetryAtMs: number | null;
		totalSamplesReceived: number;
		windowSampleCount: number;
		estimationAvailable: boolean;
		gatingState: RppgGatingOutput["state"];
		gatingReasons: string[];
	};
};

const DEFAULT_MAX_TRACE_POINTS = 120;
const DEFAULT_APP_MONITOR_INTERVAL_MS = 500;

function isManagedState(
	state: RppgSessionState | ManagedRppgSessionState,
): state is ManagedRppgSessionState {
	return "retryCount" in state;
}

function idleGating(message: string): RppgGatingOutput {
	return {
		state: "idle",
		guidance: {
			code: "idle",
			message,
		},
		publishBpm: null,
		holding: false,
		debug: {
			reasons: [],
			motionHoldUntilMs: null,
			lastStableBpm: null,
			lastStableAtMs: null,
		},
	};
}

function inferHasFace(
	diagnostics: RppgSessionDiagnostics | null,
): boolean | undefined {
	if (!diagnostics) return undefined;
	if (
		diagnostics.lastRoiSource === "face_roi" ||
		diagnostics.lastRoiSource === "multi_roi"
	) {
		return true;
	}
	return undefined;
}

function deriveStatus(
	managedState: ManagedRppgSessionState | null,
	sessionState: RppgSessionState | null,
	error: RppgNormalizedError | null,
	gating: RppgGatingOutput,
): RppgAppStatus {
	switch (managedState?.status) {
		case "idle":
			return "idle";
		case "starting":
			return "starting";
		case "retrying":
			return "retrying";
		case "stopped":
			return "stopped";
		case "failed":
			return "failed";
		default:
			break;
	}

	if (error?.terminal || sessionState?.status === "failed") {
		return "failed";
	}

	if (error || sessionState?.status === "degraded") {
		return "degraded";
	}

	if (gating.publishBpm != null && gating.state === "active") {
		return "ready";
	}

	return "running";
}

function buildRetryMessage(nextRetryAtMs: number | null, nowMs: number): string {
	if (nextRetryAtMs == null) return "Retrying after a processor failure";
	const remainingMs = Math.max(0, nextRetryAtMs - nowMs);
	const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
	return `Retrying after a processor failure in ${remainingSec}s`;
}

function deriveGuidance(
	status: RppgAppStatus,
	gating: RppgGatingOutput,
	error: RppgNormalizedError | null,
	managedState: ManagedRppgSessionState | null,
	diagnostics: RppgSessionDiagnostics | null,
	nowMs: number,
): RppgAppGuidance {
	if (error && status !== "retrying") {
		return {
			code: error.code,
			message: error.guidance,
		};
	}

	switch (status) {
		case "idle":
			return { code: "idle", message: "Ready to start monitoring" };
		case "starting":
			return {
				code: "starting",
				message: "Initializing camera and rPPG pipeline",
			};
		case "retrying":
			return {
				code: "retrying",
				message: buildRetryMessage(managedState?.nextRetryAtMs ?? null, nowMs),
			};
		case "stopped":
			return { code: "stopped", message: "Monitoring stopped" };
		case "degraded":
			if (diagnostics?.state.reason === "backend_unavailable") {
				return {
					code: "backend_unavailable",
					message:
						"Running without the estimation backend. Check your WASM asset configuration.",
				};
			}
			return {
				code: gating.guidance.code,
				message: gating.guidance.message,
			};
		default:
			return {
				code: gating.guidance.code,
				message: gating.guidance.message,
			};
	}
}

export class RppgAppAdapter {
	private readonly gating: RppgGatingController;
	private readonly nowMsValue: () => number;
	private readonly maxTracePointsValue: number;
	private readonly affectTracker: AffectTracker | null;

	constructor(options: CreateRppgAppAdapterOptions = {}) {
		this.gating = new RppgGatingController(options.gating);
		this.nowMsValue = options.nowMs ?? (() => Date.now());
		this.maxTracePointsValue =
			options.maxTracePoints ?? DEFAULT_MAX_TRACE_POINTS;
		this.affectTracker =
			options.affect === false ? null : new AffectTracker(options.affect ?? {});
	}

	reset() {
		this.gating.reset();
		this.affectTracker?.reset();
	}

	getSnapshot(source: RppgAppAdapterSource): RppgAppSnapshot {
		const nowMs = this.nowMsValue();
		const metrics = source.getMetrics();
		const diagnostics = source.getDiagnostics();
		const trace = source.getTraceSnapshot(this.maxTracePointsValue);
		const normalizedError = normalizeRppgError(
			source.lastError,
			diagnostics ?? undefined,
		);
		const managedState = isManagedState(source.state) ? source.state : null;
		let sessionState: RppgSessionState | null = diagnostics?.state ?? null;
		if (sessionState == null && !isManagedState(source.state)) {
			sessionState = source.state;
		}
		const activeCapture = managedState == null || managedState.status === "running";
		const gating = activeCapture
			? this.gating.update({
					nowMs,
					metrics,
					hasFace: inferHasFace(diagnostics),
			  })
			: (this.gating.reset(), idleGating("Monitoring paused"));
		const status = deriveStatus(managedState, sessionState, normalizedError, gating);
		const guidance = deriveGuidance(
			status,
			gating,
			normalizedError,
			managedState,
			diagnostics,
			nowMs,
		);
		const ready = status === "ready";
		const canPublish = ready && gating.publishBpm != null;

		// Affect: feed the face (blendshapes) + physiology (HR/HRV), then fuse.
		// Physiology confidence comes from the metric confidence; face confidence
		// from whether a face is currently tracked.
		let affect: AffectState | null = null;
		if (this.affectTracker && activeCapture) {
			const face = source.getLastBlendshapes?.() ?? null;
			if (face) this.affectTracker.observeFace(face.blendshapes, face.atMs);
			this.affectTracker.observePhysiology(
				metrics.bpm ?? null,
				metrics.hrv_rmssd ?? null,
			);
			affect = this.affectTracker.compute({
				bpm: metrics.bpm ?? null,
				rmssd: metrics.hrv_rmssd ?? null,
				physioConfidence: metrics.confidence ?? 0,
				faceConfidence: inferHasFace(diagnostics) ? 1 : 0,
				nowMs,
			});
		}

		return {
			status,
			ready,
			canPublish,
			publishBpm: canPublish ? gating.publishBpm : null,
			message: guidance.message,
			guidance,
			metrics,
			affect,
			diagnostics,
			trace,
			normalizedError,
			sessionState,
			managedState,
			gating,
			debug: {
				backendMode: diagnostics?.backendMode ?? null,
				faceTrackingMode: diagnostics?.faceTrackingMode ?? null,
				issues: diagnostics?.issues ?? [],
				processorFailure: diagnostics?.processorFailure ?? null,
				retryCount: managedState?.retryCount ?? 0,
				nextRetryAtMs: managedState?.nextRetryAtMs ?? null,
				totalSamplesReceived: diagnostics?.totalSamplesReceived ?? 0,
				windowSampleCount: diagnostics?.windowSampleCount ?? 0,
				estimationAvailable: diagnostics?.estimationAvailable ?? false,
				gatingState: gating.state,
				gatingReasons: gating.debug.reasons,
			},
		};
	}
}

export function createRppgAppAdapter(
	options: CreateRppgAppAdapterOptions = {},
): RppgAppAdapter {
	return new RppgAppAdapter(options);
}

type RppgAppMonitorInternals = {
	setIntervalFn?: typeof setInterval;
	clearIntervalFn?: typeof clearInterval;
};

export class RppgAppMonitor {
	private readonly adapter: RppgAppAdapter;
	private readonly intervalMs: number;
	private readonly emitImmediately: boolean;
	private readonly setIntervalFn: typeof setInterval;
	private readonly clearIntervalFn: typeof clearInterval;
	private readonly listeners = new Set<RppgAppSnapshotListener>();
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly source: RppgAppAdapterSource,
		options: CreateRppgAppMonitorOptions = {},
		internals: RppgAppMonitorInternals = {},
	) {
		this.adapter = new RppgAppAdapter(options);
		this.intervalMs = options.intervalMs ?? DEFAULT_APP_MONITOR_INTERVAL_MS;
		this.emitImmediately = options.emitImmediately !== false;
		this.setIntervalFn = internals.setIntervalFn ?? setInterval;
		this.clearIntervalFn = internals.clearIntervalFn ?? clearInterval;
	}

	getSnapshot(): RppgAppSnapshot {
		return this.adapter.getSnapshot(this.source);
	}

	subscribe(listener: RppgAppSnapshotListener): () => void {
		this.listeners.add(listener);
		if (this.emitImmediately) {
			listener(this.getSnapshot());
		}
		return () => {
			this.listeners.delete(listener);
		};
	}

	start() {
		if (this.timer) return;
		this.timer = this.setIntervalFn(() => {
			this.emit();
		}, this.intervalMs);
	}

	stop() {
		if (!this.timer) return;
		this.clearIntervalFn(this.timer);
		this.timer = null;
	}

	emit(): RppgAppSnapshot {
		const snapshot = this.getSnapshot();
		for (const listener of this.listeners) {
			listener(snapshot);
		}
		return snapshot;
	}

	dispose() {
		this.stop();
		this.listeners.clear();
	}
}

export function createRppgAppMonitor(
	source: RppgAppAdapterSource,
	options: CreateRppgAppMonitorOptions = {},
): RppgAppMonitor {
	return new RppgAppMonitor(source, options);
}
