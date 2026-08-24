/**
 * Modality vocabulary for biosignal streams.
 *
 * Names follow the `HeadbandFrameV1` block names where a block exists
 * (`ppg` = hardware PPG from `ppgRaw`, `optics` = raw optical channels,
 * `imu` = accelerometer/gyroscope). Camera-derived signals are split into
 * the waveform (`rppg-trace`) and the lower-cadence derived metric rows
 * (`rppg-metrics`, `ppg-metrics`). `events` streams carry sparse rows and
 * are never Arrow-encoded; `derived` covers enrichment outputs.
 */
export type BiosignalModality =
	| "eeg"
	| "eeg-raw"
	| "ppg"
	| "optics"
	| "imu"
	| "battery"
	| "rppg-trace"
	| "rppg-metrics"
	| "ppg-metrics"
	| "events"
	| "derived";

export const BIOSIGNAL_MODALITIES: readonly BiosignalModality[] = [
	"eeg",
	"eeg-raw",
	"ppg",
	"optics",
	"imu",
	"battery",
	"rppg-trace",
	"rppg-metrics",
	"ppg-metrics",
	"events",
	"derived",
];

export function isBiosignalModality(
	value: unknown,
): value is BiosignalModality {
	return (
		typeof value === "string" &&
		(BIOSIGNAL_MODALITIES as readonly string[]).includes(value)
	);
}

/** How samples in a stream relate to time. */
export type SamplingKind = "regular" | "irregular";

/** Which clock produced the timestamps a source reported. */
export type ClockSource = "local" | "device" | "derived";

/**
 * Arrow schema identities a stream can declare. Chunk payloads carry the
 * full Arrow schema too (chunks are independently decodable); this id is the
 * stable catalog-level name used for validation and enrichment routing.
 */
export type ArrowSchemaId =
	| "regular-wide-f32@1"
	| "battery@1"
	| "rppg-trace@1"
	| "rppg-metrics@1"
	| "ppg-metrics@1";

export const ARROW_SCHEMA_IDS: readonly ArrowSchemaId[] = [
	"regular-wide-f32@1",
	"battery@1",
	"rppg-trace@1",
	"rppg-metrics@1",
	"ppg-metrics@1",
];

export function isArrowSchemaId(value: unknown): value is ArrowSchemaId {
	return (
		typeof value === "string" &&
		(ARROW_SCHEMA_IDS as readonly string[]).includes(value)
	);
}
