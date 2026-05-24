import {
	isStoredScore,
	type StoredRecord,
	type StoredScore,
} from "../protocol";
import type { StorageAdapter } from "./types";

const DB_NAME = "elata-app-metrics";
const STORE = "records";
const DB_VERSION = 2;

const INDEX_BY_SCOPE_TS = "by_scope_ts";
const INDEX_BY_SCOPE_TYPE = "by_scope_type";
const INDEX_BY_SCOPE_VALUE = "by_scope_value";

export interface IndexedDbAdapterOptions {
	indexedDB?: IDBFactory;
	dbName?: string;
}

export function createIndexedDbAdapter(
	options: IndexedDbAdapterOptions = {},
): StorageAdapter {
	const idb = options.indexedDB ?? globalThis.indexedDB;
	const dbName = options.dbName ?? DB_NAME;

	if (!idb) {
		throw new Error(
			"IndexedDB is not available in this environment. Provide an IDBFactory via options.indexedDB or use createMemoryAdapter().",
		);
	}

	let dbPromise: Promise<IDBDatabase> | null = null;

	const open = (): Promise<IDBDatabase> => {
		if (dbPromise) return dbPromise;
		dbPromise = new Promise((resolve, reject) => {
			const req = idb.open(dbName, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				let store: IDBObjectStore;
				if (!db.objectStoreNames.contains(STORE)) {
					store = db.createObjectStore(STORE, { keyPath: "id" });
					store.createIndex(INDEX_BY_SCOPE_TS, [
						"walletAddress",
						"appId",
						"timestamp",
					]);
					store.createIndex(INDEX_BY_SCOPE_TYPE, [
						"walletAddress",
						"appId",
						"type",
					]);
				} else {
					const tx = req.transaction;
					if (!tx) throw new Error("upgrade transaction missing");
					store = tx.objectStore(STORE);
				}
				// v2: sparse index for scores (rows without `value` are skipped automatically).
				if (!store.indexNames.contains(INDEX_BY_SCOPE_VALUE)) {
					store.createIndex(INDEX_BY_SCOPE_VALUE, [
						"walletAddress",
						"appId",
						"value",
					]);
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		return dbPromise;
	};

	return {
		async put(row) {
			const db = await open();
			await new Promise<void>((resolve, reject) => {
				const t = db.transaction(STORE, "readwrite");
				const r = t.objectStore(STORE).put(row);
				r.onsuccess = () => resolve();
				r.onerror = () => reject(r.error);
				t.onerror = () => reject(t.error);
			});
		},

		async query(walletAddress, appId, filter) {
			const db = await open();
			const limit = clampLimit(filter.limit);
			const since = filter.since ?? Number.NEGATIVE_INFINITY;
			const until = filter.until ?? Number.POSITIVE_INFINITY;
			const results: StoredRecord[] = [];

			await new Promise<void>((resolve, reject) => {
				const t = db.transaction(STORE, "readonly");
				const store = t.objectStore(STORE);
				const idx = store.index(INDEX_BY_SCOPE_TS);
				const lower = [walletAddress, appId, Number.NEGATIVE_INFINITY];
				const upper = [walletAddress, appId, Number.POSITIVE_INFINITY];
				const range = IDBKeyRange.bound(lower, upper);
				const req = idx.openCursor(range, "prev");
				req.onsuccess = () => {
					const cursor = req.result;
					if (!cursor || results.length >= limit) {
						resolve();
						return;
					}
					const row = cursor.value as StoredRecord | StoredScore;
					if (!isStoredScore(row)) {
						const typeOk = filter.type === undefined || row.type === filter.type;
						const tsOk = row.timestamp >= since && row.timestamp <= until;
						if (typeOk && tsOk) results.push(row);
					}
					cursor.continue();
				};
				req.onerror = () => reject(req.error);
				t.onerror = () => reject(t.error);
			});

			return results;
		},

		async queryScores(walletAddress, appId, filter) {
			const db = await open();
			const limit = clampLimit(filter.limit);
			const since = filter.since ?? Number.NEGATIVE_INFINITY;
			const until = filter.until ?? Number.POSITIVE_INFINITY;
			const order = filter.order ?? "value_desc";
			const indexName =
				order === "value_desc" ? INDEX_BY_SCOPE_VALUE : INDEX_BY_SCOPE_TS;
			const lower = [walletAddress, appId, Number.NEGATIVE_INFINITY];
			const upper = [walletAddress, appId, Number.POSITIVE_INFINITY];
			const results: StoredScore[] = [];

			await new Promise<void>((resolve, reject) => {
				const t = db.transaction(STORE, "readonly");
				const store = t.objectStore(STORE);
				const idx = store.index(indexName);
				const range = IDBKeyRange.bound(lower, upper);
				const req = idx.openCursor(range, "prev");
				req.onsuccess = () => {
					const cursor = req.result;
					if (!cursor || results.length >= limit) {
						resolve();
						return;
					}
					const row = cursor.value as StoredRecord | StoredScore;
					if (isStoredScore(row)) {
						const tsOk = row.timestamp >= since && row.timestamp <= until;
						if (tsOk) results.push(row);
					}
					cursor.continue();
				};
				req.onerror = () => reject(req.error);
				t.onerror = () => reject(t.error);
			});

			return results;
		},

		async clearScope(walletAddress, appId) {
			const db = await open();
			await new Promise<void>((resolve, reject) => {
				const t = db.transaction(STORE, "readwrite");
				const store = t.objectStore(STORE);
				const idx = store.index(INDEX_BY_SCOPE_TS);
				const lower = [walletAddress, appId, Number.NEGATIVE_INFINITY];
				const upper = [walletAddress, appId, Number.POSITIVE_INFINITY];
				const req = idx.openCursor(IDBKeyRange.bound(lower, upper));
				req.onsuccess = () => {
					const cursor = req.result;
					if (!cursor) {
						resolve();
						return;
					}
					cursor.delete();
					cursor.continue();
				};
				req.onerror = () => reject(req.error);
				t.onerror = () => reject(t.error);
			});
		},

		async sumBytes(walletAddress, appId) {
			const db = await open();
			let total = 0;
			await new Promise<void>((resolve, reject) => {
				const t = db.transaction(STORE, "readonly");
				const store = t.objectStore(STORE);
				const idx = store.index(INDEX_BY_SCOPE_TS);
				const lower = [walletAddress, appId, Number.NEGATIVE_INFINITY];
				const upper = [walletAddress, appId, Number.POSITIVE_INFINITY];
				const req = idx.openCursor(IDBKeyRange.bound(lower, upper));
				req.onsuccess = () => {
					const cursor = req.result;
					if (!cursor) {
						resolve();
						return;
					}
					const row = cursor.value as StoredRecord | StoredScore;
					total += row.sizeBytes;
					cursor.continue();
				};
				req.onerror = () => reject(req.error);
			});
			return total;
		},
	};
}

function clampLimit(limit: number | undefined): number {
	if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return 1000;
	return Math.min(Math.floor(limit), 1000);
}
