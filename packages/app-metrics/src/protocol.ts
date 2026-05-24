/**
 * Wire protocol between the sandboxed app (client) and the appstore host.
 *
 * Transport: MessageChannel. Host posts an init message with `port2` transferred;
 * the app captures `port1` and uses it for all subsequent traffic.
 *
 * Ops: `record` / `query` / `clear` operate on generic per-app metrics records.
 * `saveScore` / `loadScores` are a specialized append-only score log with
 * value-sorted reads (top-N) — see docs/STORAGE_SCORES_PLAN.md in the appstore repo.
 */

export const PROTOCOL_VERSION = 1 as const;
export const INIT_MESSAGE_KIND = "__elata_metrics_init" as const;

export interface InitMessage {
	kind: typeof INIT_MESSAGE_KIND;
	v: typeof PROTOCOL_VERSION;
}

export interface QueryFilter {
	type?: string;
	since?: number;
	until?: number;
	limit?: number;
}

export type ScoreOrder = "value_desc" | "timestamp_desc";

export interface ScoreFilter {
	order?: ScoreOrder;
	since?: number;
	until?: number;
	limit?: number;
}

export type ClientRequest =
	| { v: 1; id: string; op: "record"; type: string; data: unknown }
	| { v: 1; id: string; op: "query"; filter: QueryFilter }
	| { v: 1; id: string; op: "clear"; scope: "app" }
	| { v: 1; id: string; op: "saveScore"; value: number; meta?: unknown }
	| { v: 1; id: string; op: "loadScores"; filter: ScoreFilter };

export type HostErrorCode =
	| "quota_exceeded"
	| "invalid_payload"
	| "rate_limited"
	| "internal";

export type HostResponse =
	| { v: 1; id: string; ok: true; result?: unknown }
	| { v: 1; id: string; ok: false; error: HostErrorCode };

export interface StoredRecord {
	id: string;
	walletAddress: string;
	appId: string;
	type: string;
	data: unknown;
	timestamp: number;
	sizeBytes: number;
}

export interface StoredScore {
	id: string;
	walletAddress: string;
	appId: string;
	value: number;
	meta?: unknown;
	timestamp: number;
	sizeBytes: number;
}

export interface AppRecord {
	id: string;
	type: string;
	data: unknown;
	timestamp: number;
}

export interface AppScore {
	id: string;
	value: number;
	meta?: unknown;
	timestamp: number;
}

const TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function isValidType(type: unknown): type is string {
	return typeof type === "string" && TYPE_PATTERN.test(type);
}

export function isValidScoreValue(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function isClientRequest(value: unknown): value is ClientRequest {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.v !== PROTOCOL_VERSION) return false;
	if (typeof v.id !== "string" || v.id.length === 0) return false;
	if (v.op === "record") {
		return isValidType(v.type) && v.data !== undefined;
	}
	if (v.op === "query") {
		return typeof v.filter === "object" && v.filter !== null;
	}
	if (v.op === "clear") {
		return v.scope === "app";
	}
	if (v.op === "saveScore") {
		return isValidScoreValue(v.value);
	}
	if (v.op === "loadScores") {
		return typeof v.filter === "object" && v.filter !== null;
	}
	return false;
}

export function toAppRecord(record: StoredRecord): AppRecord {
	return {
		id: record.id,
		type: record.type,
		data: record.data,
		timestamp: record.timestamp,
	};
}

export function toAppScore(score: StoredScore): AppScore {
	return {
		id: score.id,
		value: score.value,
		meta: score.meta,
		timestamp: score.timestamp,
	};
}

/**
 * Sparse-index marker. A score row in the object store has a `value` field;
 * a record row does not. This lets the same store hold both, and IndexedDB's
 * sparse-index semantics keep the value-sorted index scoped to scores only.
 */
export function isStoredScore(
	row: StoredRecord | StoredScore,
): row is StoredScore {
	return typeof (row as StoredScore).value === "number";
}
