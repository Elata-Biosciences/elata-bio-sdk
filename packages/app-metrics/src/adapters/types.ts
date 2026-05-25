import type { QueryFilter, StoredRecord } from "../protocol";

export interface StorageAdapter {
	put(record: StoredRecord): Promise<void>;
	query(
		walletAddress: string,
		appId: string,
		filter: QueryFilter,
	): Promise<StoredRecord[]>;
	clearScope(walletAddress: string, appId: string): Promise<void>;
	sumBytes(walletAddress: string, appId: string): Promise<number>;
}
