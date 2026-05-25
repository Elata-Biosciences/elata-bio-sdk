import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbAdapter } from "../adapters/indexeddb";
import type { StoredRecord } from "../protocol";

const baseRecord = (overrides: Partial<StoredRecord> = {}): StoredRecord => ({
	id: `id-${Math.random().toString(36).slice(2)}`,
	walletAddress: "0xwallet",
	appId: "app-a",
	type: "event",
	data: { value: 1 },
	timestamp: Date.now(),
	sizeBytes: 16,
	...overrides,
});

const freshDb = () => {
	const idb = new IDBFactory();
	return createIndexedDbAdapter({
		indexedDB: idb,
		dbName: `metrics-test-${Math.random().toString(36).slice(2)}`,
	});
};

describe("indexedDbAdapter", () => {
	it("round-trips a record", async () => {
		const a = freshDb();
		const rec = baseRecord({ id: "r1", timestamp: 100 });
		await a.put(rec);
		const rows = await a.query("0xwallet", "app-a", {});
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: "r1", type: "event" });
	});

	it("filters by type and timestamp window", async () => {
		const a = freshDb();
		await a.put(baseRecord({ id: "1", type: "alpha", timestamp: 10 }));
		await a.put(baseRecord({ id: "2", type: "beta", timestamp: 20 }));
		await a.put(baseRecord({ id: "3", type: "alpha", timestamp: 30 }));

		const onlyAlpha = await a.query("0xwallet", "app-a", { type: "alpha" });
		expect(onlyAlpha.map((r) => r.id).sort()).toEqual(["1", "3"]);

		const windowed = await a.query("0xwallet", "app-a", {
			since: 15,
			until: 25,
		});
		expect(windowed.map((r) => r.id)).toEqual(["2"]);
	});

	it("returns results newest-first and respects limit", async () => {
		const a = freshDb();
		await a.put(baseRecord({ id: "old", timestamp: 1 }));
		await a.put(baseRecord({ id: "mid", timestamp: 2 }));
		await a.put(baseRecord({ id: "new", timestamp: 3 }));

		const rows = await a.query("0xwallet", "app-a", { limit: 2 });
		expect(rows.map((r) => r.id)).toEqual(["new", "mid"]);
	});

	it("isolates between appIds and wallets", async () => {
		const a = freshDb();
		await a.put(baseRecord({ id: "1", appId: "app-a" }));
		await a.put(baseRecord({ id: "2", appId: "app-b" }));
		await a.put(baseRecord({ id: "3", walletAddress: "0xother" }));

		const onlyA = await a.query("0xwallet", "app-a", {});
		expect(onlyA.map((r) => r.id)).toEqual(["1"]);
	});

	it("sumBytes and clearScope are scoped", async () => {
		const a = freshDb();
		await a.put(baseRecord({ id: "1", sizeBytes: 100 }));
		await a.put(baseRecord({ id: "2", sizeBytes: 50, appId: "app-b" }));
		expect(await a.sumBytes("0xwallet", "app-a")).toBe(100);
		await a.clearScope("0xwallet", "app-a");
		expect(await a.sumBytes("0xwallet", "app-a")).toBe(0);
		expect(await a.sumBytes("0xwallet", "app-b")).toBe(50);
	});
});
