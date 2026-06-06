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
export { loadFaceLandmarker } from "./mediapipeLoader";
export type {
	FaceLandmarkerLike,
	FaceLandmarkerResult,
	LoadFaceLandmarkerOptions,
} from "./mediapipeLoader";
export { averageGreenInROI } from "./frameSource";
export type {
	FrameSource,
	Frame,
	ROI,
	FrameBlendshape,
	FaceLandmarkPoint,
} from "./frameSource";
export { AffectTracker } from "./affectTracker";
export type { AffectBaseline, AffectTrackerOptions } from "./affectTracker";
export {
	BaselineCalibrator,
	DEFAULT_BASELINE_CALIBRATOR_CONFIG,
} from "./baselineCalibrator";
export type {
	BaselineCalibratorConfig,
	BaselineCalibrationResult,
	CalibrationCaptureGate,
	CalibrationStall,
} from "./baselineCalibrator";
export {
	CAPTURE_MOTION_RELIABILITY,
	CaptureConfidenceScorer,
	DEFAULT_CAPTURE_CONFIDENCE_CONFIG,
	scoreCaptureFeatures,
} from "./captureConfidence";
export type {
	CaptureConfidenceConfig,
	CaptureConfidenceResult,
	CaptureFeatureInputs,
	CaptureFrameSample,
	CaptureLimiting,
} from "./captureConfidence";
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
export {
	amplitudeEnvelope,
	dominantInBand,
	estimateRespiration,
	resampleTachogram,
} from "./respirationAnalysis";
export type {
	RespCueEstimate,
	RespirationEstimate,
	RespirationInput,
	RespSource,
} from "./respirationAnalysis";
export {
	Bandpass,
	ChannelGainController,
	ChromPulseModel,
	computeSignalSnrDb,
	spectralSnr,
	zeroPhaseBandpass,
} from "./rppgSignalModel";
export { FUSION_ROIS, MultiRoiRppgFuser } from "./multiRoiFusion";
export type {
	FusionRoiName,
	MultiRoiFusionResult,
	RoiRgbSample,
} from "./multiRoiFusion";
export {
	applyNoReferenceDisplayGuard,
	shouldAllowDisplayJumpReset,
} from "./displayGuard";
export type { NoReferenceDisplayGuardDecision } from "./displayGuard";
export {
	affectStress,
	blendshapeValenceArousal,
	classifyAffectLabel,
	fuseAffect,
	physiologyArousal,
} from "./affect";
export type {
	AffectLabel,
	AffectState,
	FaceBlendshapeCategory,
	ValenceArousal,
} from "./affect";
export { DisplayBpmTracker } from "./displayBpm";
export type {
	DisplayBpmOptions,
	DisplayBpmStatus,
	DisplayBpmUpdate,
	DisplayBpmUpdateContext,
} from "./displayBpm";
export {
	computeFaceRoiRects,
	computeFusionSubRois,
	drawFaceOverlay,
	FACE_ROI_FRACTIONS,
	FUSION_ROI_NAMES,
} from "./faceRoiOverlay";
export type {
	DrawFaceOverlayOptions,
	FaceRoiName,
	LandmarkLike,
	MeshConnection,
} from "./faceRoiOverlay";
export {
	DEFAULT_FRAMING_THRESHOLDS,
	FRAMING_MESSAGES,
	faceBoxFromLandmarks,
	faceFramingFromBox,
	padFaceBoxToHead,
} from "./faceFraming";
export type {
	FaceBox,
	FramingCode,
	FramingGuidance,
	FramingThresholds,
} from "./faceFraming";
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
export { RppgSessionRecorder } from "./rppgSessionRecorder";
export type {
	RppgRecorderOptions,
	RecordMetricsContext,
} from "./rppgSessionRecorder";
export {
	aggregateComparisons,
	maeOf,
	summarizeReplaySession,
} from "./replayBenchmark";
export type {
	AbsErrorAccumulator,
	CorpusComparison,
	SessionComparison,
} from "./replayBenchmark";
