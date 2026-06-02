/**
 * Elata rPPG for the browser: camera-based pulse estimation, WASM backend, and
 * session helpers. Prefer {@link createRppgSession} for new apps; see `llms.txt`
 * in the package root for constraints (secure context, Vite WASM patterns).
 */
export {
	RppgProcessor,
	MuseCalibrationModel,
	MuseFusionCalibrator,
	museStyleFilter,
} from "./rppgProcessor";
export type {
	Backend,
	Metrics,
	BpmEvidence,
	BpmEvidenceSource,
	BpmResolutionResult,
	FusionSource,
	RppgDebugIssueCode,
	RppgDebugSnapshot,
	RppgProcessorBackendFailure,
	RppgTracePoint,
	RppgTraceSnapshot,
} from "./rppgProcessor";
export { BpmBayesTracker } from "./bpmBayesTracker";
export type {
	BpmBayesSnapshot,
	EstimatorMeasurement,
	TrackerReferenceOrigin,
	TrackerReferenceState,
	TrackerEstimate,
	TrackerContext,
	TrackerSource,
	HarmonicMode,
} from "./bpmBayesTracker";
export { DemoRunner } from "./demoRunner";
export type {
	DemoRunnerOptions,
	DemoRunnerDiagnostics,
	DemoRunnerDropReason,
} from "./demoRunner";
export { MediaPipeFrameSource } from "./mediaPipeFrameSource";
export { MediaPipeFaceFrameSource } from "./mediaPipeFaceFrameSource";
export { loadFaceMesh } from "./mediapipeLoader";
export { averageGreenInROI } from "./frameSource";
export type { FrameSource, Frame, ROI } from "./frameSource";
export { loadWasmBackend } from "./wasmBackend";
export { createUnavailableBackend } from "./wasmBackend";
export type { LoadWasmBackendOptions, WasmImporter } from "./wasmBackend";
export {
	createRppgSession,
	RppgSession,
} from "./rppgSession";
export type {
	CreateRppgSessionOptions,
	RppgSessionBackendMode,
	RppgSessionBackendPreference,
	RppgSessionDiagnostics,
	RppgSessionError,
	RppgSessionErrorCode,
	RppgSessionFaceTrackingMode,
	RppgSessionIssueCode,
	RppgSessionState,
	RppgSessionStatePhase,
	RppgSessionStateReason,
	RppgSessionStateStatus,
} from "./rppgSession";
export {
	createManagedRppgSession,
	ManagedRppgSession,
} from "./managedRppgSession";
export type {
	CreateManagedRppgSessionOptions,
	ManagedRppgSessionState,
	ManagedRppgSessionStatus,
} from "./managedRppgSession";
export { computeWaveformPeriodicityProfile } from "./rppgDiagnostics";
export { computeTraceWaveformDebug } from "./rppgDiagnostics";
export type {
	WaveformPeriodicityProfile,
	RppgTraceWaveformDebug,
	ComputeTraceWaveformDebugOptions,
} from "./rppgDiagnostics";
export {
	analyzePulseWindow,
	calculateBpmViaAutocorrelation,
	cleanNnIntervalsMs,
	computeRmssdMs,
	detectBeatsViaHilbertPhase,
	detectPeaks,
	estimateDominantBpm,
	refinePeakByInterpolation,
	rmssdFromPeaks,
	temporalNormalize,
} from "./pulseAnalysis";
export type {
	HarmonicRelation,
	HilbertBeatOptions,
	HilbertBeatResult,
	PulseAcfResult,
	PulseEstimatorResult,
	PulsePeak,
	PulseWindowAnalysis,
	PulseWindowSample,
} from "./pulseAnalysis";
export { Bandpass, spectralSnr, zeroPhaseBandpass } from "./rppgSignalModel";
export { FUSION_ROIS, MultiRoiRppgFuser } from "./multiRoiFusion";
export type {
	FusionRoiName,
	MultiRoiFusionResult,
	RoiRgbSample,
} from "./multiRoiFusion";
export { applyNoReferenceDisplayGuard } from "./displayGuard";
export type { NoReferenceDisplayGuardDecision } from "./displayGuard";
export { normalizeRppgError } from "./rppgErrors";
export type {
	RppgNormalizedError,
	RppgNormalizedErrorCode,
} from "./rppgErrors";
export {
	createRppgAppAdapter,
	createRppgAppMonitor,
	RppgAppAdapter,
	RppgAppMonitor,
} from "./rppgAppAdapter";
export type {
	CreateRppgAppAdapterOptions,
	CreateRppgAppMonitorOptions,
	RppgAppAdapterSource,
	RppgAppGuidance,
	RppgAppGuidanceCode,
	RppgAppSnapshot,
	RppgAppSnapshotListener,
	RppgAppStatus,
} from "./rppgAppAdapter";
export { ensureVideoPlaying } from "./videoPlayback";
export type { EnsureVideoPlayingOptions } from "./videoPlayback";
export { RppgGatingController } from "./rppgGating";
export type {
	RppgGatingInputs,
	RppgGatingOptions,
	RppgGatingOutput,
	RppgGatingState,
	RppgGuidanceCode,
} from "./rppgGating";
export { replayBayesSession } from "./rppgReplay";
export type {
	ReplayEstimatorSample,
	ReplaySyncSample,
	ReplayPairEvent,
	ReplayDebugSession,
	ReplayPoint,
	ReplayWindowSummary,
	ReplayBayesSessionResult,
} from "./rppgReplay";
