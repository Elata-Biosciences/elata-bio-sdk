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
if (typeof globalThis.structuredClone === "undefined") {
	globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}

// fake-indexeddb does not auto-register in jsdom. Wire IDBFactory + IDBKeyRange
// onto globalThis so storage tests work.
const fakeIdb = require("fake-indexeddb");
if (typeof globalThis.IDBKeyRange === "undefined") {
	globalThis.IDBKeyRange = fakeIdb.IDBKeyRange;
}
if (typeof globalThis.indexedDB === "undefined") {
	globalThis.indexedDB = new fakeIdb.IDBFactory();
}

// jsdom lacks TextEncoder/TextDecoder in some versions; Arrow and checksum
// helpers need them.
const { TextEncoder, TextDecoder } = require("node:util");
if (typeof globalThis.TextEncoder === "undefined") {
	globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
	globalThis.TextDecoder = TextDecoder;
}
