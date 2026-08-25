/**
 * Chunk decoding: Arrow IPC file bytes → typed columns + Elata identity.
 * Every chunk is independently decodable; no other chunk or catalog row is
 * needed to interpret one payload.
 *
 * Independent of *when* it was written, too. Chunks outlive the code that
 * wrote them, so the readers here are explicit about schema drift in both
 * directions: `diffChunkColumns` names the difference between what a chunk
 * carries and what a reader expects, and `readRowsAgainstSchema` reads
 * across it — columns a chunk predates come back null, columns it gained
 * since are left untouched in the file.
 */

import { Schema, Table, Vector, tableFromIPC } from "apache-arrow";
import { ELATA_META_KEYS } from "./schemas";

export interface DecodedChunk {
	table: Table;
	rowCount: number;
	columnNames: string[];
	identity: {
		sessionId: string | null;
		streamId: string | null;
		arrowSchemaId: string | null;
	};
}

export function decodeChunk(bytes: Uint8Array | ArrayBuffer): DecodedChunk {
	const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const table = tableFromIPC(payload);
	const metadata = table.schema.metadata;
	return {
		table,
		rowCount: table.numRows,
		columnNames: table.schema.fields.map((field) => field.name),
		identity: {
			sessionId: metadata.get(ELATA_META_KEYS.sessionId) ?? null,
			streamId: metadata.get(ELATA_META_KEYS.streamId) ?? null,
			arrowSchemaId: metadata.get(ELATA_META_KEYS.arrowSchemaId) ?? null,
		},
	};
}

/** Read one Float32 column as a `Float32Array` (nulls become NaN). */
export function readFloat32Column(table: Table, name: string): Float32Array {
	const vector = table.getChild(name);
	if (!vector) throw new Error(`column not found: ${name}`);
	const out = new Float32Array(vector.length);
	for (let i = 0; i < vector.length; i++) {
		const value = vector.get(i);
		out[i] = value === null || value === undefined ? Number.NaN : Number(value);
	}
	return out;
}

/** Read the `time_us` Int64 column as JS numbers (safe ≤ 2^53 µs). */
export function readTimeUsColumn(table: Table): number[] {
	const vector = table.getChild("time_us");
	if (!vector) throw new Error("column not found: time_us");
	const out: number[] = new Array(vector.length);
	for (let i = 0; i < vector.length; i++) {
		out[i] = Number(vector.get(i));
	}
	return out;
}

/**
 * Read one column, or `null` when the chunk does not carry it — the answer a
 * reader needs for a column added to the schema after the chunk was written.
 */
export function readOptionalColumn(table: Table, name: string): Vector | null {
	return table.getChild(name) ?? null;
}

/** How a chunk's columns differ from the ones a reader expects. */
export interface ChunkColumnDiff {
	/** In the reader's schema, absent from the chunk — it predates them. */
	missing: string[];
	/** In the chunk, unknown to the reader's schema — it postdates it. */
	extra: string[];
}

/**
 * Compare a decoded chunk's columns with the schema a reader knows today.
 * Neither list is an error on its own: `missing` is an older chunk,
 * `extra` is a newer one. Both are worth logging before deciding.
 */
export function diffChunkColumns(
	table: Table,
	expected: Schema,
): ChunkColumnDiff {
	const present = new Set(table.schema.fields.map((field) => field.name));
	const known = new Set(expected.fields.map((field) => field.name));
	return {
		missing: expected.fields
			.filter((field) => !present.has(field.name))
			.map((field) => field.name),
		extra: table.schema.fields
			.filter((field) => !known.has(field.name))
			.map((field) => field.name),
	};
}

/** Arrow hands list cells back as vectors; everything else comes as-is. */
function cellValue(value: unknown): unknown {
	if (value === undefined) return null;
	if (value instanceof Vector) return [...value];
	return value;
}

/**
 * Read a chunk's rows against the schema a reader knows today.
 *
 * Every field of `schema` appears on every row: `null` when the chunk
 * predates that column, never `0` — for a metric column those are different
 * and equally plausible answers. Columns the chunk carries that `schema`
 * does not name are skipped here and left in the file, so reading an
 * unexpectedly new chunk never destroys anything.
 *
 * Values are returned as Arrow decoded them, which keeps `Int64` columns as
 * `bigint`: converting to `number` is lossy past 2^53 and is the caller's
 * decision (see `readTimeUsColumn` for the session-time shortcut).
 */
export function readRowsAgainstSchema(
	table: Table,
	schema: Schema,
): Record<string, unknown>[] {
	const columns = schema.fields.map((field) => ({
		name: field.name,
		vector: table.getChild(field.name) ?? null,
	}));
	const rows: Record<string, unknown>[] = new Array(table.numRows);
	for (let i = 0; i < table.numRows; i++) {
		const row: Record<string, unknown> = {};
		for (const column of columns) {
			row[column.name] = column.vector ? cellValue(column.vector.get(i)) : null;
		}
		rows[i] = row;
	}
	return rows;
}
