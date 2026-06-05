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

/** v0 dimension is 'calm'; others reserved for later sensors. */
export type AffectDimension = "calm" | "stress" | "focus";

/**
 * Derived per-session aggregate sent by `reportAffect` — the one op that is NOT
 * local-only. The host forwards it to the platform-owned biometric Score, gated
 * by the `biometrics` scope + user consent. All values are derived scalars —
 * never raw signal.
 */
export interface AffectReport {
	dimension: AffectDimension;
	baselineValue: number; // 0..1
	sessionValue: number; // 0..1
	delta: number; // -1..1
	meanHr?: number; // session-aggregate vital, not a waveform
	signalQuality: number; // 0..1
	confidence: number; // 0..1
	source: string; // 'rppg' | 'rppg+hrv' | …
	durationSec: number;
}

/** Result of a `reportAffect` op (host → client). */
export interface ReportAffectResult {
	accepted: boolean; // false if dropped as unqualified
	calibrating: boolean; // true while below cold-start
	score: number | null; // 0–100 once calibrated, else null
}

export type ClientRequest =
	| { v: 1; id: string; op: "record"; type: string; data: unknown }
	| { v: 1; id: string; op: "query"; filter: QueryFilter }
	| { v: 1; id: string; op: "clear"; scope: "app" }
	| { v: 1; id: string; op: "saveScore"; value: number; meta?: unknown }
	| { v: 1; id: string; op: "loadScores"; filter: ScoreFilter }
	| { v: 1; id: string; op: "reportAffect"; report: AffectReport };

export type HostErrorCode =
	| "quota_exceeded"
	| "invalid_payload"
	| "rate_limited"
	| "internal"
	| "scope_denied" // app lacks the biometrics scope, or user has not consented
	| "not_supported"; // host has no reportAffect handler wired

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

export function isValidAffectReport(value: unknown): value is AffectReport {
	if (!value || typeof value !== "object") return false;
	const r = value as Record<string, unknown>;
	const in01 = (n: unknown): n is number =>
		typeof n === "number" && n >= 0 && n <= 1;
	return (
		(r.dimension === "calm" ||
			r.dimension === "stress" ||
			r.dimension === "focus") &&
		in01(r.baselineValue) &&
		in01(r.sessionValue) &&
		typeof r.delta === "number" &&
		r.delta >= -1 &&
		r.delta <= 1 &&
		in01(r.signalQuality) &&
		in01(r.confidence) &&
		typeof r.source === "string" &&
		r.source.length > 0 &&
		r.source.length <= 64 &&
		typeof r.durationSec === "number" &&
		Number.isInteger(r.durationSec) &&
		r.durationSec >= 0 &&
		(r.meanHr === undefined ||
			(typeof r.meanHr === "number" && r.meanHr >= 20 && r.meanHr <= 240))
	);
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
	if (v.op === "reportAffect") {
		return isValidAffectReport(v.report);
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
