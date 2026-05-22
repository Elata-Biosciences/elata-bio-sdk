import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbAdapter } from "../adapters/indexeddb";
import type { StoredRecord, StoredScore } from "../protocol";

function makeAdapter(name: string) {
	return createIndexedDbAdapter({
		indexedDB: new IDBFactory(),
		dbName: name,
	});
}

const WALLET = "0xWALLET";
const APP = "app-1";

function record(
	id: string,
	overrides: Partial<StoredRecord> = {},
): StoredRecord {
	return {
		id,
		walletAddress: WALLET,
		appId: APP,
		type: "evt",
		data: { x: 1 },
		timestamp: 1_000,
		sizeBytes: 10,
		...overrides,
	};
}

function score(
	id: string,
	value: number,
	overrides: Partial<StoredScore> = {},
): StoredScore {
	return {
		id,
		walletAddress: WALLET,
		appId: APP,
		value,
		timestamp: 1_000,
		sizeBytes: 10,
		...overrides,
	};
}

describe("indexeddb adapter: scores", () => {
	test("queryScores returns scores in value_desc order by default", async () => {
		const a = makeAdapter("db1");
		await a.put(score("s1", 10));
		await a.put(score("s2", 100));
		await a.put(score("s3", 50));
		const out = await a.queryScores(WALLET, APP, {});
		expect(out.map((s) => s.value)).toEqual([100, 50, 10]);
	});

	test("queryScores does not return records (sparse value index)", async () => {
		const a = makeAdapter("db2");
		await a.put(record("r1"));
		await a.put(score("s1", 7));
		const out = await a.queryScores(WALLET, APP, {});
		expect(out).toHaveLength(1);
		expect(out[0]?.id).toBe("s1");
	});

	test("query returns records, not scores", async () => {
		const a = makeAdapter("db3");
		await a.put(record("r1", { timestamp: 1 }));
		await a.put(score("s1", 5, { timestamp: 2 }));
		const out = await a.query(WALLET, APP, {});
		expect(out).toHaveLength(1);
		expect(out[0]?.id).toBe("r1");
	});

	test("queryScores with timestamp_desc order", async () => {
		const a = makeAdapter("db4");
		await a.put(score("s1", 10, { timestamp: 100 }));
		await a.put(score("s2", 5, { timestamp: 200 }));
		await a.put(score("s3", 50, { timestamp: 50 }));
		const out = await a.queryScores(WALLET, APP, { order: "timestamp_desc" });
		expect(out.map((s) => s.id)).toEqual(["s2", "s1", "s3"]);
	});

	test("sumBytes accounts for both records and scores", async () => {
		const a = makeAdapter("db5");
		await a.put(record("r1", { sizeBytes: 30 }));
		await a.put(score("s1", 1, { sizeBytes: 20 }));
		expect(await a.sumBytes(WALLET, APP)).toBe(50);
	});

	test("clearScope removes both records and scores", async () => {
		const a = makeAdapter("db6");
		await a.put(record("r1"));
		await a.put(score("s1", 1));
		await a.clearScope(WALLET, APP);
		expect(await a.query(WALLET, APP, {})).toEqual([]);
		expect(await a.queryScores(WALLET, APP, {})).toEqual([]);
	});

	test("scope isolation: another wallet/app does not see rows", async () => {
		const a = makeAdapter("db7");
		await a.put(score("s1", 99));
		expect(await a.queryScores("OTHER", APP, {})).toEqual([]);
		expect(await a.queryScores(WALLET, "other-app", {})).toEqual([]);
	});

	test("queryScores limit caps result count", async () => {
		const a = makeAdapter("db8");
		for (let i = 0; i < 30; i++) {
			await a.put(score(`s${i}`, i));
		}
		const out = await a.queryScores(WALLET, APP, { limit: 5 });
		expect(out).toHaveLength(5);
		expect(out[0]?.value).toBe(29);
	});
});
