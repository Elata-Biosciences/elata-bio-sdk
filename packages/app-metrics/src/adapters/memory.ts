import type { QueryFilter, StoredRecord } from "../protocol";
import type { StorageAdapter } from "./types";

/** In-memory adapter — primarily for tests and SSR no-op fallbacks. */
export function createMemoryAdapter(): StorageAdapter {
	const rows: StoredRecord[] = [];

	return {
		async put(record) {
			rows.push(record);
		},
		async query(walletAddress, appId, filter) {
			const out = rows.filter(
				(r) =>
					r.walletAddress === walletAddress &&
					r.appId === appId &&
					(filter.type === undefined || r.type === filter.type) &&
					(filter.since === undefined || r.timestamp >= filter.since) &&
					(filter.until === undefined || r.timestamp <= filter.until),
			);
			out.sort((a, b) => b.timestamp - a.timestamp);
			const limit = clampLimit(filter.limit);
			return out.slice(0, limit);
		},
		async clearScope(walletAddress, appId) {
			for (let i = rows.length - 1; i >= 0; i--) {
				const r = rows[i];
				if (r && r.walletAddress === walletAddress && r.appId === appId) {
					rows.splice(i, 1);
				}
			}
		},
		async sumBytes(walletAddress, appId) {
			let total = 0;
			for (const r of rows) {
				if (r.walletAddress === walletAddress && r.appId === appId) {
					total += r.sizeBytes;
				}
			}
			return total;
		},
	};
}

function clampLimit(limit: number | undefined): number {
	if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return 1000;
	return Math.min(Math.floor(limit), 1000);
}
