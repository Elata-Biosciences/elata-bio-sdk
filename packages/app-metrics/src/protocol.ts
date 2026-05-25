/**
 * Wire protocol between the sandboxed app (client) and the appstore host.
 * Internal — not part of the public API surface.
 */

export const PROTOCOL_VERSION = 1 as const;

export const INIT_MESSAGE_KIND = "__elata_metrics_init" as const;

/** Sent by the host once per iframe load, with a transferred MessagePort. */
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

export type ClientRequest =
	| { v: 1; id: string; op: "record"; type: string; data: unknown }
	| { v: 1; id: string; op: "query"; filter: QueryFilter }
	| { v: 1; id: string; op: "clear"; scope: "app" };

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

/** Public-facing record (what apps see when querying their own data). */
export interface AppRecord {
	id: string;
	type: string;
	data: unknown;
	timestamp: number;
}

const TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function isValidType(type: unknown): type is string {
	return typeof type === "string" && TYPE_PATTERN.test(type);
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
