export {
	BASELINE_MIN_SESSIONS,
	isBaselineUsable,
	robustZFromBaseline,
} from "./baseline.js";
export type {
	BaselineProvider,
	PersonalBaseline,
	RobustZResult,
} from "./baseline.js";
export {
	buildContributor,
	compositeValue,
	CONTRIBUTOR_MIN_QUALITY,
	MIN_INCLUDED_WEIGHT,
	SIGMOID_GAIN,
	sigmoid,
} from "./contributors.js";
export type {
	ContributorInput,
	HeadlineScoreId,
	HeadlineScoreV1,
	ScoreContributor,
	WithheldReason,
} from "./contributors.js";
export {
	MQ_MIN_VALID_DURATION_S,
	scoreMeasurementQuality,
} from "./measurementQuality.js";
export type {
	MeasurementQualityInput,
	SignalComponent,
} from "./measurementQuality.js";
export { ACTIVATION_MIN_MQ, scoreActivation } from "./activation.js";
export type { ActivationInput, ActivationMetricInput } from "./activation.js";
export {
	ACTIVATION_EPOCH_MIN_DELTA_BPM,
	detectActivationEpoch,
	RECOVERY_MIN_MQ,
	scoreRecovery,
} from "./recovery.js";
export type {
	ActivationEpoch,
	RecoveryInput,
	RecoveryMetricInput,
} from "./recovery.js";
