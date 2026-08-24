/**
 * Chunk decoding: Arrow IPC file bytes → typed columns + Elata identity.
 * Every chunk is independently decodable; no other chunk or catalog row is
 * needed to interpret one payload.
 */

import { Table, tableFromIPC } from "apache-arrow";
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
