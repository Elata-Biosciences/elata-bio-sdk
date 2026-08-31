/**
 * Provenance records. Derived values never replace source data; everything
 * computed or preprocessed carries enough provenance to be recomputed or
 * audited later.
 */

/**
 * EEG preprocessing provenance — mirrors `HeadbandEegProcessingDetails`
 * from `@elata-biosciences/eeg-web` (0.12.x) so recorded streams preserve
 * exactly what the live pipeline reported.
 */
export interface EegProcessingProvenanceV1 {
	kind: "eeg-processing";
	applied: boolean;
	signalKind: "raw" | "processed";
	rawAvailable: boolean;
	referenceMode: "none" | "common-average" | "custom-average";
	detrendMode: "off" | "highpass" | "linear";
	notchFrequenciesHz: number[];
	stageOrder: string[];
}

/**
 * rPPG processing provenance — package version plus the estimator/model
 * identities `@elata-biosciences/rppg-web` (0.14.x) exposes.
 */
export interface RppgProcessingProvenanceV1 {
	kind: "rppg-processing";
	packageVersion: string;
	waveformModel?: { manifestId: string; version: string; modelSha256: string };
	roiProfileId?: string;
	trackerConfigId?: string;
	qualityProviderId?: string;
}

export type StreamProcessingProvenanceV1 =
	| EegProcessingProvenanceV1
	| RppgProcessingProvenanceV1;

/** Session-level recorder/SDK provenance. */
export interface SessionProvenanceV1 {
	/** `@elata-biosciences/biosignal-session` version that recorded. */
	recorderVersion: string;
	/** Wire protocol version used. */
	protocolVersion: number;
	/** SDK packages active in the producing app. */
	sdkPackages: { name: string; version: string }[];
	userAgent?: string;
}
