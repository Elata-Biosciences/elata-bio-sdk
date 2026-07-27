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
export {
	BpmBayesTracker,
	DEFAULT_BPM_TRACKER_CONFIG_V1,
	parseBpmTrackerConfigV1,
} from "./bpmBayesTracker";
export type {
	BpmTrackerConfigV1,
	BpmEvidenceQuality,
	BpmEvidenceQualityProvider,
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
	ELATA_FACE_YCBCR_V1_FRACTIONS,
	ELATA_FACE_YCBCR_V1_PROFILE,
	MCD_PROXY_INPUT_V1_FRACTIONS,
	MCD_PROXY_INPUT_V1_PROFILE,
	TRADELOCK_LIVE_FOREHEAD_V1_PROFILE,
	computeFractionalFaceRoiRects,
} from "./roiProfile";
export type {
	FaceRoiFraction,
	FaceRoiFractions,
	RoiGeometryProfile,
} from "./roiProfile";
export {
	ELATA_YCBCR_V1_PIXEL_SAMPLER,
	TRADELOCK_RGB_WEIGHTED_V1_PIXEL_SAMPLER,
	isTradeLockSkinPixel,
	isYcbcrSkinPixel,
	sampleRppgRoi,
	tradeLockSpatialWeight,
} from "./roiPixelSampler";
export type {
	RoiPixelSampler,
	RppgRoiSampleV1,
	RppgRoiStatistics,
} from "./roiPixelSampler";
export {
	MCD_WAVEFORM_CHANNELS,
	MCD_WAVEFORM_ROIS,
	WaveformFeatureWindowBuilder,
} from "./waveformFeatureWindow";
export type {
	RppgModelDiagnosticsV1,
	WaveformFeatureWindowV1,
	WaveformModelManifestV1,
	WaveformModelStatus,
	WaveformReconstructionV1,
	WaveformReconstructor,
} from "./waveformModel";
export { WaveformReconstructionController } from "./waveformReconstructionController";
export {
	createWaveformMorphologyBaseline,
	extractWaveformMorphology,
} from "./waveformMorphology";
export type {
	WaveformMorphologyBaselineV1,
	WaveformMorphologySource,
	WaveformMorphologyV1,
} from "./waveformMorphology";
export {
	createPhysiologyInterpreter,
	DEFAULT_PHYSIOLOGY_INTERPRETER_CONFIG_V1,
	normalizePhysiologyFeatures,
} from "./physiologyFeatures";
export type {
	PhysiologyBaselineV1,
	PhysiologyFeaturesV1,
	PhysiologyInterpretationV1,
	PhysiologyInterpreter,
	PhysiologyInterpreterConfigV1,
	PhysiologyState,
} from "./physiologyFeatures";
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
