/**
 * `HeadbandTransport` (eeg-web / eeg-web-ble) → `BiosignalSource`.
 *
 * Maps `HeadbandFrameV1` blocks onto session streams:
 * `eeg` → "eeg" (or "eeg-raw" when the live pipeline reports raw signal),
 * `eegRaw` → "eeg-raw", `ppgRaw` → "ppg", `optics` → "optics",
 * `accgyro` → "imu", `battery` → "battery" (irregular). The frame's
 * `eegProcessing` details become stream provenance; transport `sequenceId`
 * gaps hint a "ble-reconnect" discontinuity; device-clock timestamps are
 * captured as alignment observations (never used as canonical time).
 *
 * Peer imports are type-only — the adapter receives a live transport
 * instance and never imports eeg-web at runtime.
 */

import type {
	HeadbandEegProcessingDetails,
	HeadbandFrameV1,
	HeadbandSignalBlock,
	HeadbandTransport,
	HeadbandTransportStatus,
} from "@elata-biosciences/eeg-web";
import type {
	SourceDescriptorDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import type { EegProcessingProvenanceV1 } from "../contracts/provenance";
import { CLOCK_OBSERVATION_INTERVALS } from "../contracts/time";
import type { SessionUs } from "../contracts/time";
import type { BiosignalSource, SourceSink, StreamHandle } from "./types";
import type { BiosignalModality } from "../contracts/modality";

export interface HeadbandSourceOptions {
	/** Source name recorded in descriptors (default "headband"). */
	name?: string;
	/** Record `frame.eegRaw` as an "eeg-raw" stream when present. Default true. */
	includeRaw?: boolean;
	/** SDK package identities for provenance. */
	sdkPackages?: { name: string; version: string }[];
}

type BlockKey = "eeg" | "eeg-raw" | "ppg" | "optics" | "imu";

interface OpenStream {
	handle: StreamHandle;
	sampleIndex: number;
	sampleRateHz: number;
	lastDeviceObservationUs: SessionUs | null;
}

function provenanceFrom(
	details: HeadbandEegProcessingDetails,
): EegProcessingProvenanceV1 {
	return {
		kind: "eeg-processing",
		applied: details.applied,
		signalKind: details.signalKind,
		rawAvailable: details.rawAvailable,
		referenceMode: details.referenceMode,
		detrendMode: details.detrendMode,
		notchFrequenciesHz: [...details.notchFrequenciesHz],
		stageOrder: [...details.stageOrder],
	};
}

function rawProvenance(
	details: HeadbandEegProcessingDetails | undefined,
): EegProcessingProvenanceV1 {
	return {
		kind: "eeg-processing",
		applied: false,
		signalKind: "raw",
		rawAvailable: true,
		referenceMode: "none",
		detrendMode: "off",
		notchFrequenciesHz: [],
		stageOrder: [],
		...(details ? { rawAvailable: details.rawAvailable } : {}),
	};
}

/** Row-major flatten of `samples[sampleIdx][channelIdx]`. */
function flattenBlock(block: HeadbandSignalBlock): Float32Array {
	const rows = block.samples.length;
	const channels = block.channelCount;
	const data = new Float32Array(rows * channels);
	for (let row = 0; row < rows; row++) {
		const sample = block.samples[row] ?? [];
		for (let channel = 0; channel < channels; channel++) {
			data[row * channels + channel] = sample[channel] ?? 0;
		}
	}
	return data;
}

export function createHeadbandSource(
	transport: HeadbandTransport,
	options: HeadbandSourceOptions = {},
): BiosignalSource {
	const name = options.name ?? "headband";
	const includeRaw = options.includeRaw ?? true;

	let sink: SourceSink | null = null;
	let previousOnFrame: HeadbandTransport["onFrame"];
	let previousOnStatus: HeadbandTransport["onStatus"];
	const streams = new Map<string, OpenStream>();
	let batteryStream: OpenStream | null = null;
	let lastSequenceId: number | null = null;
	let pendingReconnect = false;

	const openRegular = (
		activeSink: SourceSink,
		key: BlockKey,
		modality: BiosignalModality,
		block: HeadbandSignalBlock,
		processing?: EegProcessingProvenanceV1,
	): OpenStream => {
		const existing = streams.get(key);
		if (existing) return existing;
		const draft: StreamDescriptorDraft = {
			sourceId: name,
			modality,
			sampling: "regular",
			sampleRateHz: block.sampleRateHz,
			channels:
				block.channelNames.length > 0
					? block.channelNames.map((channelName) => ({ name: channelName }))
					: Array.from({ length: block.channelCount }, (_, index) => ({
							name: `ch${index + 1}`,
						})),
			encoding: "arrow-ipc",
			arrowSchemaId: "regular-wide-f32@1",
			layout: "wide",
			clockSource: block.clockSource ?? "local",
			processing,
		};
		const open: OpenStream = {
			handle: activeSink.openStream(draft),
			sampleIndex: 0,
			sampleRateHz: block.sampleRateHz,
			lastDeviceObservationUs: null,
		};
		streams.set(key, open);
		return open;
	};

	const pushBlock = (
		activeSink: SourceSink,
		key: BlockKey,
		modality: BiosignalModality,
		block: HeadbandSignalBlock,
		frame: HeadbandFrameV1,
		nowUs: SessionUs,
		processing?: EegProcessingProvenanceV1,
	): void => {
		const rows = block.samples.length;
		if (rows === 0) return;
		const stream = openRegular(activeSink, key, modality, block, processing);
		if (pendingReconnect) {
			stream.handle.hintDiscontinuity?.("ble-reconnect");
		}
		// Align the batch so its LAST sample lands at the arrival instant.
		const timeUs0 =
			nowUs - Math.round(((rows - 1) * 1_000_000) / stream.sampleRateHz);
		stream.handle.pushRegular(
			flattenBlock(block),
			rows,
			stream.sampleIndex,
			timeUs0,
		);
		stream.sampleIndex += rows;

		// Device clocks become alignment observations on a 10 s cadence.
		if (
			block.clockSource === "device" &&
			block.timestampsMs &&
			block.timestampsMs.length > 0
		) {
			const due =
				stream.lastDeviceObservationUs === null ||
				nowUs - stream.lastDeviceObservationUs >=
					CLOCK_OBSERVATION_INTERVALS.deviceClockMs * 1000;
			if (due) {
				stream.lastDeviceObservationUs = nowUs;
				activeSink.clockObservation({
					sourceId: name,
					streamId: stream.handle.streamId,
					kind: "device-clock",
					observedAtUs: nowUs,
					deviceTimestampMs: block.timestampsMs[block.timestampsMs.length - 1],
					sequenceId: frame.sequenceId,
				});
			}
		}
	};

	const onFrame = (frame: HeadbandFrameV1): void => {
		const activeSink = sink;
		if (!activeSink) return;
		const nowUs = activeSink.clock.nowUs();

		if (lastSequenceId !== null && frame.sequenceId !== lastSequenceId + 1) {
			pendingReconnect = true;
			activeSink.event({
				timestampUs: nowUs,
				kind: "device-status",
				name: "ble.sequence-gap",
				payload: { expected: lastSequenceId + 1, actual: frame.sequenceId },
			});
		}
		lastSequenceId = frame.sequenceId;

		const processing = frame.eegProcessing
			? provenanceFrom(frame.eegProcessing)
			: undefined;
		const eegModality: BiosignalModality =
			frame.eegProcessing?.signalKind === "raw" ? "eeg-raw" : "eeg";
		pushBlock(
			activeSink,
			"eeg",
			eegModality,
			frame.eeg,
			frame,
			nowUs,
			processing,
		);
		if (includeRaw && frame.eegRaw && eegModality !== "eeg-raw") {
			pushBlock(
				activeSink,
				"eeg-raw",
				"eeg-raw",
				frame.eegRaw,
				frame,
				nowUs,
				rawProvenance(frame.eegProcessing),
			);
		}
		if (frame.ppgRaw)
			pushBlock(activeSink, "ppg", "ppg", frame.ppgRaw, frame, nowUs);
		if (frame.optics) {
			pushBlock(activeSink, "optics", "optics", frame.optics, frame, nowUs);
		}
		if (frame.accgyro)
			pushBlock(activeSink, "imu", "imu", frame.accgyro, frame, nowUs);

		if (frame.battery && frame.battery.samples.length > 0) {
			if (!batteryStream) {
				batteryStream = {
					handle: activeSink.openStream({
						sourceId: name,
						modality: "battery",
						sampling: "irregular",
						channels: [{ name: "battery_pct", unit: "%" }],
						encoding: "arrow-ipc",
						arrowSchemaId: "battery@1",
						layout: "wide",
						clockSource: frame.battery.clockSource ?? "local",
					}),
					sampleIndex: 0,
					sampleRateHz: 0,
					lastDeviceObservationUs: null,
				};
			}
			const rows = frame.battery.samples.length;
			const timesUs = new Float64Array(rows).fill(nowUs);
			batteryStream.handle.pushIrregular(
				timesUs,
				Float32Array.from(frame.battery.samples),
				rows,
			);
		}

		pendingReconnect = false;
		previousOnFrame?.(frame);
	};

	const onStatus = (status: HeadbandTransportStatus): void => {
		const activeSink = sink;
		if (activeSink) {
			activeSink.status({
				state: String(status.state),
				errorCode: status.errorCode,
				detail: status.reason,
			});
			if (String(status.state) === "reconnecting") pendingReconnect = true;
		}
		previousOnStatus?.(status);
	};

	return {
		descriptor(): SourceDescriptorDraft {
			return {
				kind: "wearable",
				name,
				adapter: "headband-transport@1",
				sdkPackages: options.sdkPackages ?? [],
			};
		},

		streams(): StreamDescriptorDraft[] {
			return []; // opened lazily as blocks appear in frames
		},

		async start(nextSink: SourceSink): Promise<void> {
			sink = nextSink;
			previousOnFrame = transport.onFrame;
			previousOnStatus = transport.onStatus;
			transport.onFrame = onFrame;
			transport.onStatus = onStatus;
		},

		async stop(): Promise<void> {
			const activeSink = sink;
			transport.onFrame = previousOnFrame;
			transport.onStatus = previousOnStatus;
			if (activeSink) {
				const endUs = activeSink.clock.nowUs();
				for (const stream of streams.values()) stream.handle.close(endUs);
				batteryStream?.handle.close(endUs);
			}
			streams.clear();
			batteryStream = null;
			sink = null;
		},
	};
}
