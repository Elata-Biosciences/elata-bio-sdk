import {
	isStoredScore,
	type QueryFilter,
	type ScoreFilter,
	type StoredRecord,
	type StoredScore,
} from "../protocol";
import type { StorageAdapter } from "./types";

type Row = StoredRecord | StoredScore;

export function createMemoryAdapter(): StorageAdapter {
	const rows: Row[] = [];

	const scopeFilter = (walletAddress: string, appId: string) => (r: Row) =>
		r.walletAddress === walletAddress && r.appId === appId;

	return {
		async put(row) {
			rows.push(row);
		},
		async query(walletAddress, appId, filter) {
			const limit = clampLimit(filter.limit);
			const since = filter.since ?? Number.NEGATIVE_INFINITY;
			const until = filter.until ?? Number.POSITIVE_INFINITY;
			const result = rows
				.filter(scopeFilter(walletAddress, appId))
				.filter((r): r is StoredRecord => !isStoredScore(r))
				.filter((r) => (filter.type === undefined ? true : r.type === filter.type))
				.filter((r) => r.timestamp >= since && r.timestamp <= until)
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, limit);
			return result;
		},
		async queryScores(walletAddress, appId, filter) {
			const limit = clampLimit(filter.limit);
			const since = filter.since ?? Number.NEGATIVE_INFINITY;
			const until = filter.until ?? Number.POSITIVE_INFINITY;
			const order = filter.order ?? "value_desc";
			const result = rows
				.filter(scopeFilter(walletAddress, appId))
				.filter(isStoredScore)
				.filter((r) => r.timestamp >= since && r.timestamp <= until);
			if (order === "value_desc") {
				result.sort((a, b) =>
					b.value === a.value ? b.timestamp - a.timestamp : b.value - a.value,
				);
			} else {
				result.sort((a, b) => b.timestamp - a.timestamp);
			}
			return result.slice(0, limit);
		},
		async clearScope(walletAddress, appId) {
			for (let i = rows.length - 1; i >= 0; i--) {
				const row = rows[i];
				if (row && row.walletAddress === walletAddress && row.appId === appId) {
					rows.splice(i, 1);
				}
			}
		},
		async sumBytes(walletAddress, appId) {
			return rows
				.filter(scopeFilter(walletAddress, appId))
				.reduce((sum, r) => sum + r.sizeBytes, 0);
		},
	};
}

function clampLimit(limit: number | undefined): number {
	if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return 1000;
	return Math.min(Math.floor(limit), 1000);
}
