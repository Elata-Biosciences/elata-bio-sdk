// jsdom does not implement MessageChannel/MessagePort. Provide Node's
// worker_threads implementation, which is spec-compatible for our usage
// (onmessage, postMessage, start, close, transferring via structuredClone).
const { MessageChannel, MessagePort } = require("node:worker_threads");

if (typeof globalThis.MessageChannel === "undefined") {
	globalThis.MessageChannel = MessageChannel;
}
if (typeof globalThis.MessagePort === "undefined") {
	globalThis.MessagePort = MessagePort;
}

// jsdom (jest env) lacks structuredClone, which fake-indexeddb requires on put.
// Our adapter tests use plain JSON-serializable rows, so a JSON clone is
// sufficient. Production uses the browser's native structuredClone.
if (typeof globalThis.structuredClone === "undefined") {
	globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

// fake-indexeddb does not auto-register in jsdom. Wire IDBFactory + IDBKeyRange
// onto globalThis so the adapter (which uses the global IDBKeyRange) works.
const fakeIdb = require("fake-indexeddb");
if (typeof globalThis.IDBKeyRange === "undefined") {
	globalThis.IDBKeyRange = fakeIdb.IDBKeyRange;
}
if (typeof globalThis.indexedDB === "undefined") {
	globalThis.indexedDB = new fakeIdb.IDBFactory();
}
