import { createRppgAppAdapter } from "../rppgAppAdapter";
import type { RppgAppAdapterSource } from "../rppgAppAdapter";
import type { ManagedRppgSessionState } from "../managedRppgSession";
import type {
	RppgSessionDiagnostics,
	RppgSessionError,
	RppgSessionState,
} from "../rppgSession";

function createDiagnostics(
	overrides: Partial<RppgSessionDiagnostics> = {},
): RppgSessionDiagnostics {
	return {
		backendMode: "wasm",
		estimationAvailable: true,
		faceTrackingMode: "video_frame",
		roiSource: "fallback_roi",
		processorMethod: "rgb_meta",
		totalSamplesReceived: 24,
		windowSampleCount: 24,
		windowDurationMs: 800,
		lastSampleTimestampMs: 1000,
		lastSampleAgeMs: 30,
		lastSample: null,
		processorIssues: [],
		issues: [],
		processorFailure: null,
		state: {
			status: "running",
			phase: "none",
			terminal: false,
			reason: null,
			errorCode: null,
			errorStage: null,
		},
		lastError: null,
		framesSeen: 24,
		framesWithFaceRoi: 0,
		framesWithFallbackRoi: 24,
		framesWithMultiRoi: 0,
		samplesPushed: 24,
		droppedFrames: 0,
		lastDropReason: null,
		lastTimestampMs: 1000,
		lastIntensity: 0.42,
		lastSkinRatio: 0.6,
		lastClipRatio: 0.04,
		lastMotion: 0.01,
		lastProcessorMethod: "rgb_meta",
		lastRoiSource: "fallback_roi",
		...overrides,
	};
}

function createSource(
	overrides: Partial<RppgAppAdapterSource> & {
		state?: RppgSessionState | ManagedRppgSessionState;
		lastError?: RppgSessionError | null;
	} = {},
): RppgAppAdapterSource {
	return {
		state:
			overrides.state ??
			({
				status: "running",
				phase: "none",
				terminal: false,
				reason: null,
				errorCode: null,
				errorStage: null,
			} satisfies RppgSessionState),
		lastError: overrides.lastError ?? null,
		getMetrics:
			overrides.getMetrics ??
			(() => ({
				bpm: 72,
				confidence: 0.82,
				signal_quality: 0.76,
				calibration_trained: true,
				baseline_bpm: 72,
				skin_ratio_mean: 0.62,
				motion_mean: 0.01,
			})),
		getDiagnostics: overrides.getDiagnostics ?? (() => createDiagnostics()),
		getTraceSnapshot:
			overrides.getTraceSnapshot ??
			(() => ({
				sampleRate: 30,
				windowSec: 5,
				totalSamplesReceived: 24,
				windowSampleCount: 24,
				windowDurationMs: 800,
				durationSec: 0.8,
				points: [],
				lastSample: null,
				backendFailure: null,
			})),
	};
}

describe("RppgAppAdapter", () => {
	test("derives a ready app snapshot from a healthy running session", () => {
		const adapter = createRppgAppAdapter({ nowMs: () => 1000 });
		const snapshot = adapter.getSnapshot(createSource());

		expect(snapshot.status).toBe("ready");
		expect(snapshot.ready).toBe(true);
		expect(snapshot.canPublish).toBe(true);
		expect(snapshot.publishBpm).toBe(72);
		expect(snapshot.guidance.code).toBe("active_monitoring");
		expect(snapshot.message).toBe("Active monitoring");
		expect(snapshot.debug.estimationAvailable).toBe(true);
	});

	test("surfaces retrying state without publishing stale data", () => {
		const adapter = createRppgAppAdapter({ nowMs: () => 1000 });
		const state: ManagedRppgSessionState = {
			status: "retrying",
			retryCount: 1,
			maxRetries: 3,
			retryDelayMs: 1500,
			restartOnProcessorFailure: true,
			lastError: {
				code: "processor_error",
				stage: "processor",
				message: "unreachable",
				timestampMs: 900,
			},
			nextRetryAtMs: 2300,
		};

		const snapshot = adapter.getSnapshot(
			createSource({
				state,
				lastError: state.lastError,
				getDiagnostics: () =>
					createDiagnostics({
						state: {
							status: "failed",
							phase: "runtime",
							terminal: true,
							reason: "processor_error",
							errorCode: "processor_error",
							errorStage: "processor",
						},
						lastError: state.lastError,
					}),
			}),
		);

		expect(snapshot.status).toBe("retrying");
		expect(snapshot.ready).toBe(false);
		expect(snapshot.canPublish).toBe(false);
		expect(snapshot.publishBpm).toBeNull();
		expect(snapshot.guidance.code).toBe("retrying");
		expect(snapshot.message).toContain("Retrying after a processor failure");
		expect(snapshot.debug.retryCount).toBe(1);
	});

	test("normalizes degraded backend-unavailable mode into app-facing guidance", () => {
		const adapter = createRppgAppAdapter({ nowMs: () => 1000 });
		const snapshot = adapter.getSnapshot(
			createSource({
				getMetrics: () => ({
					bpm: null,
					confidence: 0,
					signal_quality: 0,
				}),
				getDiagnostics: () =>
					createDiagnostics({
						backendMode: "unavailable",
						estimationAvailable: false,
						issues: ["backend_unavailable"],
						state: {
							status: "degraded",
							phase: "startup",
							terminal: false,
							reason: "backend_unavailable",
							errorCode: null,
							errorStage: null,
						},
					}),
			}),
		);

		expect(snapshot.status).toBe("degraded");
		expect(snapshot.canPublish).toBe(false);
		expect(snapshot.normalizedError?.code).toBe("backend_unavailable");
		expect(snapshot.message).toContain("Serve the packaged WASM assets");
	});

	test("maps terminal processor failures into a failed app snapshot", () => {
		const adapter = createRppgAppAdapter({ nowMs: () => 1000 });
		const error: RppgSessionError = {
			code: "processor_error",
			stage: "processor",
			message: "processor panic: unreachable",
			timestampMs: 1000,
		};
		const snapshot = adapter.getSnapshot(
			createSource({
				lastError: error,
				state: {
					status: "failed",
					phase: "runtime",
					terminal: true,
					reason: "processor_error",
					errorCode: "processor_error",
					errorStage: "processor",
				},
				getDiagnostics: () =>
					createDiagnostics({
						state: {
							status: "failed",
							phase: "runtime",
							terminal: true,
							reason: "processor_error",
							errorCode: "processor_error",
							errorStage: "processor",
						},
						lastError: error,
					}),
			}),
		);

		expect(snapshot.status).toBe("failed");
		expect(snapshot.ready).toBe(false);
		expect(snapshot.canPublish).toBe(false);
		expect(snapshot.normalizedError?.code).toBe("processor_failed");
		expect(snapshot.guidance.code).toBe("processor_failed");
	});
});
