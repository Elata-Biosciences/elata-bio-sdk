import { MessageChannel as NodeMessageChannel } from "node:worker_threads";

type Globals = {
	MessageChannel?: unknown;
	structuredClone?: unknown;
};

const g = globalThis as Globals;

if (typeof g.MessageChannel === "undefined") {
	g.MessageChannel = NodeMessageChannel;
}

if (typeof g.structuredClone === "undefined") {
	// Node 17+ ships structuredClone as a global; jsdom hides it from the test realm.
	// Reach into the Node realm via a fresh require/import-side handle.
	// Fallback to JSON cloning for the StoredRecord shape we use here.
	g.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value));
}
