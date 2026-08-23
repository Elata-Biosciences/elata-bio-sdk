import {
	Bool,
	Float32,
	Float64,
	Int16,
	Int32,
	Int64,
	tableFromArrays,
	tableFromIPC,
	tableToIPC,
	Utf8,
	vectorFromArray,
} from "apache-arrow";
import {
	ARROW_STREAM_ENCODING,
	type ArrowChunkV1,
	type ArrowColumnInput,
	type ArrowRecordBatchInputV1,
	type SessionChunkV1,
	type SessionStreamV1,
	type StreamFieldV1,
} from "./contracts";
import { SessionError } from "./errors";
import { sha256Hex, streamSchemaSha256 } from "./hash";
import { validateChunk, validateStream } from "./validation";

export interface EncodeArrowChunkOptions {
	sessionId: string;
	sequence: number;
	startOffsetUs: number;
	endOffsetUs?: number;
}

function valuesForField(
	field: StreamFieldV1,
	input: ArrowColumnInput,
): unknown {
	const values = Array.from(input);
	switch (field.valueType) {
		case "float32":
			return vectorFromArray(
				values as readonly (number | null)[],
				new Float32(),
			);
		case "float64":
			return vectorFromArray(
				values as readonly (number | null)[],
				new Float64(),
			);
		case "int16":
			return vectorFromArray(values as readonly (number | null)[], new Int16());
		case "int32":
			return vectorFromArray(values as readonly (number | null)[], new Int32());
		case "int64":
			return vectorFromArray(values as readonly (bigint | null)[], new Int64());
		case "boolean":
			return vectorFromArray(values as readonly (boolean | null)[], new Bool());
		case "utf8":
			return vectorFromArray(values as readonly (string | null)[], new Utf8());
	}
}

function inputLength(input: ArrowColumnInput): number {
	return input.length;
}

export async function encodeArrowChunk(
	stream: SessionStreamV1,
	input: ArrowRecordBatchInputV1,
	options: EncodeArrowChunkOptions,
): Promise<ArrowChunkV1> {
	validateStream(stream);
	const expected = new Set(stream.fields.map((field) => field.name));
	const actual = Object.keys(input.columns);
	if (
		actual.length !== expected.size ||
		actual.some((name) => !expected.has(name))
	) {
		throw new SessionError(
			"schema_mismatch",
			"Arrow columns do not match stream fields",
		);
	}
	let sampleCount: number | null = null;
	const vectors: Record<string, unknown> = {};
	for (const field of stream.fields) {
		const column = input.columns[field.name];
		if (!column) {
			throw new SessionError(
				"schema_mismatch",
				`Missing Arrow column ${field.name}`,
			);
		}
		const length = inputLength(column);
		if (sampleCount === null) sampleCount = length;
		if (length !== sampleCount || length === 0) {
			throw new SessionError(
				"schema_mismatch",
				"Arrow columns must have equal non-zero lengths",
			);
		}
		vectors[field.name] = valuesForField(field, column);
	}
	const count = sampleCount ?? 0;
	const table = tableFromArrays(vectors as Record<string, any>);
	const payload = tableToIPC(table as any, "stream");
	const endOffsetUs =
		options.endOffsetUs ??
		(stream.timing.kind === "regular"
			? options.startOffsetUs +
				Math.round(((count - 1) * 1_000_000) / stream.timing.sampleRateHz)
			: options.startOffsetUs);
	const descriptor: SessionChunkV1 = {
		sessionId: options.sessionId,
		streamId: stream.streamId,
		sequence: options.sequence,
		startOffsetUs: options.startOffsetUs,
		endOffsetUs,
		sampleCount: count,
		encoding: ARROW_STREAM_ENCODING,
		schemaSha256: await streamSchemaSha256(stream),
		byteLength: payload.byteLength,
		sha256: await sha256Hex(payload),
	};
	validateChunk(descriptor);
	return { descriptor, payload };
}

export interface DecodedArrowChunkV1 {
	descriptor: SessionChunkV1;
	columns: Record<string, readonly unknown[]>;
}

export async function decodeArrowChunk(
	stream: SessionStreamV1,
	chunk: ArrowChunkV1,
): Promise<DecodedArrowChunkV1> {
	validateStream(stream);
	validateChunk(chunk.descriptor);
	if (chunk.descriptor.streamId !== stream.streamId) {
		throw new SessionError(
			"schema_mismatch",
			"Chunk stream ID does not match stream",
		);
	}
	if ((await streamSchemaSha256(stream)) !== chunk.descriptor.schemaSha256) {
		throw new SessionError(
			"schema_mismatch",
			"Chunk schema hash does not match stream",
		);
	}
	if (chunk.payload.byteLength !== chunk.descriptor.byteLength) {
		throw new SessionError(
			"invalid_chunk",
			"Chunk byte length does not match descriptor",
		);
	}
	if ((await sha256Hex(chunk.payload)) !== chunk.descriptor.sha256) {
		throw new SessionError(
			"checksum_mismatch",
			"Chunk checksum does not match descriptor",
		);
	}
	const table = tableFromIPC(chunk.payload);
	if (table.numRows !== chunk.descriptor.sampleCount) {
		throw new SessionError(
			"schema_mismatch",
			"Arrow row count does not match descriptor",
		);
	}
	const columns: Record<string, readonly unknown[]> = {};
	for (const field of stream.fields) {
		const vector = table.getChild(field.name);
		if (!vector) {
			throw new SessionError(
				"schema_mismatch",
				`Arrow payload is missing ${field.name}`,
			);
		}
		columns[field.name] = Array.from(vector);
	}
	if (table.numCols !== stream.fields.length) {
		throw new SessionError(
			"schema_mismatch",
			"Arrow payload has unexpected columns",
		);
	}
	return { descriptor: chunk.descriptor, columns };
}
