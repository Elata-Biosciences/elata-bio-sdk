import type {
	FrameSource,
	FrameSourceError,
	FrameSourceWithErrors,
} from "./frameSource";
import {
	MediaPipeFaceFrameSource,
	type FaceMeshLike,
} from "./mediaPipeFaceFrameSource";
import { MediaPipeFrameSource } from "./mediaPipeFrameSource";
import { loadFaceMesh } from "./mediapipeLoader";
import {
	RppgProcessor,
	type Metrics,
	type RppgDebugIssueCode,
	type RppgDebugSnapshot,
} from "./rppgProcessor";
import {
	loadWasmBackend,
	createUnavailableBackend,
	type Backend,
} from "./wasmBackend";
import {
	DemoRunner,
	type DemoRunnerDiagnostics,
	type DemoRunnerError,
	type DemoRunnerOptions,
} from "./demoRunner";

export type RppgSessionBackendPreference = "auto" | "wasm";
export type RppgSessionBackendMode = "wasm" | "unavailable";
export type RppgSessionFaceTrackingMode = "face_mesh" | "video_frame";
export type RppgSessionIssueCode =
	| RppgDebugIssueCode
	| "backend_unavailable"
	| "face_mesh_unavailable";
export type RppgSessionErrorCode =
	| "backend_init_failed"
	| "face_mesh_init_failed"
	| "capture_error"
	| "processor_error";

export type RppgSessionError = {
	code: RppgSessionErrorCode;
	stage: "backend" | "face_mesh" | "capture" | "processor";
	message: string;
	timestampMs: number;
	cause?: unknown;
};

export type RppgSessionDiagnostics = DemoRunnerDiagnostics & {
	backendMode: RppgSessionBackendMode;
	estimationAvailable: boolean;
	faceTrackingMode: RppgSessionFaceTrackingMode;
	roiSource: DemoRunnerDiagnostics["lastRoiSource"];
	processorMethod: DemoRunnerDiagnostics["lastProcessorMethod"];
	totalSamplesReceived: number;
	windowSampleCount: number;
	windowDurationMs: number;
	lastSampleTimestampMs: number | null;
	lastSampleAgeMs: number | null;
	lastSample: RppgDebugSnapshot["lastSample"];
	processorIssues: RppgDebugIssueCode[];
	issues: RppgSessionIssueCode[];
	lastError: RppgSessionError | null;
};

export type CreateRppgSessionOptions = Omit<
	DemoRunnerOptions,
	"onDiagnostics" | "onError"
> & {
	video: HTMLVideoElement;
	sampleRate?: number;
	windowSec?: number;
	backend?: RppgSessionBackendPreference;
	faceMesh?: FaceMeshLike | "auto" | "off";
	enableTracker?:
		| boolean
		| {
				minBpm?: number;
				maxBpm?: number;
				numParticles?: number;
		  };
	autoStart?: boolean;
	onDiagnostics?: (diagnostics: RppgSessionDiagnostics) => void;
	onError?: (error: RppgSessionError) => void;
};

type SessionInternals = {
	onDiagnostics?: (diagnostics: RppgSessionDiagnostics) => void;
	onError?: (error: RppgSessionError) => void;
};

export class RppgSession {
	private lastErrorValue: RppgSessionError | null = null;

	constructor(
		public readonly source: FrameSource,
		public readonly processor: RppgProcessor,
		public readonly runner: DemoRunner,
		public readonly backendMode: RppgSessionBackendMode,
		public readonly faceTrackingMode: RppgSessionFaceTrackingMode,
		private readonly internals: SessionInternals = {},
	) {}

	get lastError(): RppgSessionError | null {
		return this.lastErrorValue;
	}

	getMetrics(): Metrics {
		return this.processor.getMetrics();
	}

	getDebugSnapshot(nowMs = Date.now()): RppgDebugSnapshot {
		return this.processor.getDebugSnapshot(nowMs);
	}

	getDiagnostics(nowMs = Date.now()): RppgSessionDiagnostics {
		const runnerDiagnostics = this.runner.getDiagnostics();
		const debugSnapshot = this.processor.getDebugSnapshot(nowMs);
		const issues = new Set<RppgSessionIssueCode>(debugSnapshot.issues);
		if (this.backendMode !== "wasm") issues.add("backend_unavailable");
		if (this.faceTrackingMode !== "face_mesh") issues.add("face_mesh_unavailable");

		return {
			...runnerDiagnostics,
			backendMode: this.backendMode,
			estimationAvailable: this.backendMode === "wasm",
			faceTrackingMode: this.faceTrackingMode,
			roiSource: runnerDiagnostics.lastRoiSource,
			processorMethod: runnerDiagnostics.lastProcessorMethod,
			totalSamplesReceived: debugSnapshot.totalSamplesReceived,
			windowSampleCount: debugSnapshot.windowSampleCount,
			windowDurationMs: debugSnapshot.windowDurationMs,
			lastSampleTimestampMs: debugSnapshot.lastSampleTimestampMs,
			lastSampleAgeMs: debugSnapshot.lastSampleAgeMs,
			lastSample: debugSnapshot.lastSample,
			processorIssues: debugSnapshot.issues,
			issues: Array.from(issues),
			lastError: this.lastErrorValue,
		};
	}

	async start(): Promise<void> {
		await this.runner.start();
		this.emitDiagnostics();
	}

	async stop(): Promise<void> {
		await this.runner.stop();
		this.emitDiagnostics();
	}

	async dispose(): Promise<void> {
		await this.stop();
	}

	recordError(error: RppgSessionError) {
		this.lastErrorValue = error;
		this.internals.onError?.(error);
		this.emitDiagnostics();
	}

	emitDiagnostics() {
		this.internals.onDiagnostics?.(this.getDiagnostics());
	}
}

export async function createRppgSession(
	options: CreateRppgSessionOptions,
): Promise<RppgSession> {
	const sampleRate = options.sampleRate ?? 30;
	const windowSec = options.windowSec ?? 10;
	const backendPreference = options.backend ?? "auto";
	const enableTracker = options.enableTracker ?? true;
	const pendingErrors: RppgSessionError[] = [];

	const faceMeshResult = await resolveFaceMesh(options.faceMesh);
	if (faceMeshResult.error) pendingErrors.push(faceMeshResult.error);

	const faceTrackingMode: RppgSessionFaceTrackingMode = faceMeshResult.faceMesh
		? "face_mesh"
		: "video_frame";
	const source = faceMeshResult.faceMesh
		? new MediaPipeFaceFrameSource(
				options.video,
				faceMeshResult.faceMesh,
				sampleRate,
			)
		: new MediaPipeFrameSource(options.video, { fps: sampleRate });

	const backendResult = await resolveBackend(backendPreference);
	const processor = new RppgProcessor(
		backendResult.backend,
		sampleRate,
		windowSec,
	);
	applyTrackerConfiguration(processor, enableTracker);
	let session: RppgSession | null = null;

	const runner = new DemoRunner(source, processor, {
		roi: options.roi,
		roiSmoothingAlpha: options.roiSmoothingAlpha ?? 0.25,
		useSkinMask: options.useSkinMask ?? true,
		onStats: options.onStats,
		skinRatioSmoothingAlpha: options.skinRatioSmoothingAlpha,
		onDiagnostics: () => {
			session?.emitDiagnostics();
		},
		onError: (error: DemoRunnerError) => {
			session?.recordError({
				code: "processor_error",
				stage: "processor",
				message: error.message,
				timestampMs: error.timestampMs,
				cause: error.cause,
			});
		},
	});

	session = new RppgSession(
		source,
		processor,
		runner,
		backendResult.mode,
		faceTrackingMode,
		{
			onDiagnostics: options.onDiagnostics,
			onError: options.onError,
		},
	);

	attachSourceErrorForwarder(source, session);
	for (const error of pendingErrors) {
		session.recordError(error);
	}

	if (options.autoStart !== false) {
		await session.start();
	}

	return session;
}

async function resolveFaceMesh(
	faceMeshOption: CreateRppgSessionOptions["faceMesh"],
): Promise<{
	faceMesh: FaceMeshLike | null;
	error: RppgSessionError | null;
}> {
	if (faceMeshOption && faceMeshOption !== "auto" && faceMeshOption !== "off") {
		return { faceMesh: faceMeshOption, error: null };
	}
	if (faceMeshOption === "off") {
		return { faceMesh: null, error: null };
	}

	try {
		const faceMesh = await loadFaceMesh();
		return { faceMesh, error: null };
	} catch (cause) {
		return {
			faceMesh: null,
			error: {
				code: "face_mesh_init_failed",
				stage: "face_mesh",
				message:
					cause instanceof Error
						? cause.message
						: "FaceMesh failed to initialize.",
				timestampMs: Date.now(),
				cause,
			},
		};
	}
}

async function resolveBackend(
	backendPreference: RppgSessionBackendPreference,
): Promise<{ backend: Backend; mode: RppgSessionBackendMode }> {
	const backend = await loadWasmBackend(undefined, {
		strict: backendPreference === "wasm",
	});
	if (backend) {
		return { backend, mode: "wasm" };
	}
	return { backend: createUnavailableBackend(), mode: "unavailable" };
}

function applyTrackerConfiguration(
	processor: RppgProcessor,
	enableTracker: CreateRppgSessionOptions["enableTracker"],
) {
	if (!enableTracker) return;
	if (enableTracker === true) {
		processor.enableTracker(55, 150, 200);
		return;
	}
	processor.enableTracker(
		enableTracker.minBpm ?? 55,
		enableTracker.maxBpm ?? 150,
		enableTracker.numParticles ?? 200,
	);
}

function attachSourceErrorForwarder(source: FrameSource, session: RppgSession) {
	const errorSource = source as Partial<FrameSourceWithErrors>;
	if (typeof errorSource.getLastError !== "function") return;
	errorSource.onError = (error: FrameSourceError) => {
		session.recordError({
			code:
				error.stage === "face_mesh" ? "face_mesh_init_failed" : "capture_error",
			stage: error.stage,
			message: error.message,
			timestampMs: error.timestampMs,
			cause: error.cause,
		});
	};
}
