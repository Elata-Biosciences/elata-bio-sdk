import type { QueryFilter, StoredRecord } from "../protocol";
import type { StorageAdapter } from "./types";

const DB_NAME = "elata-app-metrics";
const STORE = "records";
const DB_VERSION = 1;

export interface IndexedDbAdapterOptions {
	/** Override the IDB factory (used by tests with fake-indexeddb). */
	indexedDB?: IDBFactory;
	/** Override the DB name. Defaults to `elata-app-metrics`. */
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
				if (!db.objectStoreNames.contains(STORE)) {
					const store = db.createObjectStore(STORE, { keyPath: "id" });
					store.createIndex("by_scope_ts", ["walletAddress", "appId", "timestamp"]);
					store.createIndex("by_scope_type", ["walletAddress", "appId", "type"]);
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		return dbPromise;
	};

	return {
		async put(record) {
			const db = await open();
			await tx(db, "readwrite", (store) => store.put(record));
		},
		async query(walletAddress, appId, filter) {
			const db = await open();
			const limit = clampLimit(filter.limit);
			const since = filter.since ?? -Infinity;
			const until = filter.until ?? Infinity;
			const results: StoredRecord[] = [];

			await new Promise<void>((resolve, reject) => {
				const t = db.transaction(STORE, "readonly");
				const store = t.objectStore(STORE);
				const idx = store.index("by_scope_ts");
				// Range covers all timestamps for the scope; we filter further in-cursor.
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
					const value = cursor.value as StoredRecord;
					const typeOk = filter.type === undefined || value.type === filter.type;
					const tsOk = value.timestamp >= since && value.timestamp <= until;
					if (typeOk && tsOk) results.push(value);
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
				const idx = store.index("by_scope_ts");
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
				const idx = store.index("by_scope_ts");
				const lower = [walletAddress, appId, Number.NEGATIVE_INFINITY];
				const upper = [walletAddress, appId, Number.POSITIVE_INFINITY];
				const req = idx.openCursor(IDBKeyRange.bound(lower, upper));
				req.onsuccess = () => {
					const cursor = req.result;
					if (!cursor) {
						resolve();
						return;
					}
					const value = cursor.value as StoredRecord;
					total += value.sizeBytes;
					cursor.continue();
				};
				req.onerror = () => reject(req.error);
			});
			return total;
		},
	};
}

function tx<T>(
	db: IDBDatabase,
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const t = db.transaction(STORE, mode);
		const store = t.objectStore(STORE);
		const req = fn(store);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		t.onerror = () => reject(t.error);
	});
}

function clampLimit(limit: number | undefined): number {
	if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return 1000;
	return Math.min(Math.floor(limit), 1000);
}
