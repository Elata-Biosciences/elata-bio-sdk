import type {
	QueryFilter,
	ScoreFilter,
	StoredRecord,
	StoredScore,
} from "../protocol";

export interface StorageAdapter {
	put(row: StoredRecord | StoredScore): Promise<void>;
	query(
		walletAddress: string,
		appId: string,
		filter: QueryFilter,
	): Promise<StoredRecord[]>;
	queryScores(
		walletAddress: string,
		appId: string,
		filter: ScoreFilter,
	): Promise<StoredScore[]>;
	clearScope(walletAddress: string, appId: string): Promise<void>;
	sumBytes(walletAddress: string, appId: string): Promise<number>;
}
