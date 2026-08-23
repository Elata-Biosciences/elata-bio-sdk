import { encodeArrowChunk } from "./arrow";
import type {
	ArrowChunkV1,
	SessionEventV1,
	SessionSourceV1,
	SessionStreamV1,
} from "./contracts";
import { SessionError } from "./errors";

export interface HeadbandSignalBlockLike {
	sampleRateHz: number;
	channelNames: string[];
	channelCount: number;
	samples: number[][];
	timestampsMs?: number[];
	clockSource?: "device" | "local";
}

export interface HeadbandFrameV1Like {
	schemaVersion: string;
	source: string;
	sequenceId: number;
	emittedAtMs: number;
	eeg: HeadbandSignalBlockLike;
	eegRaw?: HeadbandSignalBlockLike;
	ppgRaw?: HeadbandSignalBlockLike;
	optics?: HeadbandSignalBlockLike;
	accgyro?: HeadbandSignalBlockLike;
}

export interface AdaptedSignalChunkV1 {
	source: SessionSourceV1;
	stream: SessionStreamV1;
	chunk: ArrowChunkV1;
}

export interface HeadbandAdapterOptionsV1 {
	sourceId?: string;
	sessionOriginMs?: number;
	sequence?: number;
}

function fieldName(name: string, index: number): string {
	const normalized = name.trim().replace(/[^A-Za-z0-9._:-]+/g, "_");
	return normalized && /^[A-Za-z0-9]/.test(normalized)
		? normalized
		: `channel_${index}`;
}

export async function adaptHeadbandSignalBlock(
	frame: HeadbandFrameV1Like,
	sessionId: string,
	blockName: "eeg" | "eegRaw" | "ppgRaw" | "optics" | "accgyro" = "eeg",
	options: HeadbandAdapterOptionsV1 = {},
): Promise<AdaptedSignalChunkV1> {
	const block = frame[blockName];
	if (
		!block ||
		block.samples.length === 0 ||
		block.channelCount !== block.channelNames.length
	) {
		throw new SessionError(
			"schema_mismatch",
			`Invalid Headband ${blockName} block`,
		);
	}
	const modality =
		blockName === "ppgRaw" || blockName === "optics"
			? "ppg"
			: blockName === "accgyro"
				? "imu"
				: "eeg";
	const sourceId = options.sourceId ?? "headband";
	const streamId = `${sourceId}.${blockName}`;
	const names = block.channelNames.map(fieldName);
	const columns: Record<string, Float32Array> = {};
	for (let channel = 0; channel < names.length; channel++) {
		columns[names[channel]] = Float32Array.from(
			block.samples.map((row) => row[channel] ?? Number.NaN),
		);
	}
	const source: SessionSourceV1 = {
		sourceId,
		name: frame.source || "Headband",
		kind: "wearable",
		manufacturer: "Headband",
		metadata: { inputSchemaVersion: frame.schemaVersion },
	};
	const stream: SessionStreamV1 = {
		streamId,
		sourceId,
		name: `Headband ${blockName}`,
		modality,
		kind: blockName === "eeg" ? "processed" : "raw",
		schemaVersion: "elata.headband-signal/v1",
		timing: {
			kind: "regular",
			sampleRateHz: block.sampleRateHz,
			clockSource: block.clockSource ?? "local",
		},
		fields: names.map((name) => ({ name, valueType: "float32" as const })),
		metadata: { sourceFrameSequence: frame.sequenceId },
	};
	const startOffsetUs = Math.max(
		0,
		Math.round(
			((block.timestampsMs?.[0] ?? frame.emittedAtMs) -
				(options.sessionOriginMs ?? 0)) *
				1000,
		),
	);
	return {
		source,
		stream,
		chunk: await encodeArrowChunk(
			stream,
			{ columns },
			{
				sessionId,
				sequence: options.sequence ?? frame.sequenceId,
				startOffsetUs,
			},
		),
	};
}

export interface ReplaySyncSampleLike {
	epochTs: number;
	sampleRate?: number | null;
	stage?: string;
	estimators?: {
		finalBpm?: number | null;
		bayesBpm?: number | null;
		bayesConfidence?: number | null;
		cameraConfidence?: number | null;
		snrDb?: number | null;
		motion?: number | null;
		suppressed?: boolean | null;
	};
	outputs?: { signalQuality?: number | null };
}

export interface ReplayDebugSessionLike {
	syncSamples: ReplaySyncSampleLike[];
	pairEvents?: Array<{ ts: number; referenceBpm: number }>;
}

export interface AdaptedRppgSessionV1 extends AdaptedSignalChunkV1 {
	events: SessionEventV1[];
}

export async function adaptRppgReplaySession(
	replay: ReplayDebugSessionLike,
	sessionId: string,
	sequence = 0,
	sessionOriginMs?: number,
): Promise<AdaptedRppgSessionV1> {
	if (!replay.syncSamples.length)
		throw new SessionError("schema_mismatch", "rPPG replay has no samples");
	const samples = [...replay.syncSamples].sort((a, b) => a.epochTs - b.epochTs);
	const originMs = sessionOriginMs ?? samples[0].epochTs;
	const source: SessionSourceV1 = {
		sourceId: "rppg-camera",
		name: "rPPG camera",
		kind: "camera",
	};
	const stream: SessionStreamV1 = {
		streamId: "rppg.metrics",
		sourceId: source.sourceId,
		name: "rPPG estimates",
		modality: "rppg",
		kind: "derived",
		schemaVersion: "elata.rppg-metrics/v1",
		timing: {
			kind: "irregular",
			offsetField: "offset_us",
			clockSource: "local",
		},
		fields: [
			{ name: "offset_us", valueType: "int64" },
			{
				name: "final_bpm",
				valueType: "float64",
				unit: "beats/min",
				nullable: true,
			},
			{
				name: "bayes_bpm",
				valueType: "float64",
				unit: "beats/min",
				nullable: true,
			},
			{ name: "bayes_confidence", valueType: "float64", nullable: true },
			{ name: "signal_quality", valueType: "float64", nullable: true },
			{ name: "suppressed", valueType: "boolean", nullable: true },
			{ name: "stage", valueType: "utf8", nullable: true },
		],
		provenance: { algorithmId: "elata.rppg", algorithmVersion: "unknown" },
	};
	const columns = {
		offset_us: samples.map((sample) =>
			BigInt(Math.max(0, Math.round((sample.epochTs - originMs) * 1000))),
		),
		final_bpm: samples.map((sample) => sample.estimators?.finalBpm ?? null),
		bayes_bpm: samples.map((sample) => sample.estimators?.bayesBpm ?? null),
		bayes_confidence: samples.map(
			(sample) => sample.estimators?.bayesConfidence ?? null,
		),
		signal_quality: samples.map(
			(sample) => sample.outputs?.signalQuality ?? null,
		),
		suppressed: samples.map((sample) => sample.estimators?.suppressed ?? null),
		stage: samples.map((sample) => sample.stage ?? null),
	};
	const chunk = await encodeArrowChunk(
		stream,
		{ columns },
		{
			sessionId,
			sequence,
			startOffsetUs: 0,
			endOffsetUs: Math.max(
				0,
				Math.round((samples[samples.length - 1].epochTs - originMs) * 1000),
			),
		},
	);
	const events: SessionEventV1[] = (replay.pairEvents ?? []).map(
		(event, index) => ({
			eventId: `rppg-pair:${sequence}:${index}`,
			sessionId,
			offsetUs: Math.max(0, Math.round((event.ts - originMs) * 1000)),
			type: "rppg.reference-pair",
			schemaVersion: "1",
			data: { referenceBpm: event.referenceBpm },
		}),
	);
	return { source, stream, chunk, events };
}
