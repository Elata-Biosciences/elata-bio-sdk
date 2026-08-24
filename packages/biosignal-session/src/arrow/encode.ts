/**
 * Chunk encoding: rows/columns → a complete Arrow IPC *file* payload.
 *
 * The wide fast path wraps `Float32Array` columns zero-copy; the generic
 * row path drives per-field builders (metrics streams with mixed types).
 */

import {
	Float32,
	Int64,
	RecordBatch,
	Schema,
	Struct,
	Table,
	makeBuilder,
	makeData,
	tableToIPC,
} from "apache-arrow";
import type { ChunkIdentity } from "./schemas";
import { regularWideF32Schema } from "./schemas";

/** Encode per-channel Float32 columns (all equal length) as one chunk. */
export function encodeWideF32Chunk(
	channelNames: readonly string[],
	columns: readonly Float32Array[],
	identity: ChunkIdentity,
): Uint8Array {
	if (channelNames.length !== columns.length) {
		throw new Error(
			`channel/column mismatch: ${channelNames.length} names, ${columns.length} columns`,
		);
	}
	const rowCount = columns[0]?.length ?? 0;
	for (const column of columns) {
		if (column.length !== rowCount) {
			throw new Error("all channel columns must have equal length");
		}
	}
	const schema = regularWideF32Schema(channelNames, identity);
	const children = columns.map((column) =>
		makeData({
			type: new Float32(),
			length: rowCount,
			nullCount: 0,
			data: column,
		}),
	);
	const structData = makeData({
		type: new Struct(schema.fields),
		length: rowCount,
		nullCount: 0,
		children,
	});
	const batch = new RecordBatch(schema, structData);
	const table = new Table(schema, [batch]);
	return tableToIPC(table, "file");
}

/**
 * Encode heterogeneous rows against an explicit schema. `Int64` fields accept
 * JS numbers (converted to BigInt); missing/undefined values become nulls.
 */
export function encodeRowsChunk(
	schema: Schema,
	rows: readonly Record<string, unknown>[],
): Uint8Array {
	const builders = schema.fields.map((field) =>
		makeBuilder({ type: field.type, nullValues: [null, undefined] }),
	);
	for (const row of rows) {
		schema.fields.forEach((field, i) => {
			let value = row[field.name];
			if (
				value !== null &&
				value !== undefined &&
				field.type instanceof Int64
			) {
				if (typeof value === "number") value = BigInt(Math.round(value));
			}
			builders[i].append(value as never);
		});
	}
	const children = builders.map((builder) => builder.finish().flush());
	const structData = makeData({
		type: new Struct(schema.fields),
		length: rows.length,
		children,
	});
	const batch = new RecordBatch(schema, structData);
	const table = new Table(schema, [batch]);
	return tableToIPC(table, "file");
}
