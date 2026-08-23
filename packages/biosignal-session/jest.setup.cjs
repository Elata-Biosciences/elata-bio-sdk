const { MessageChannel, MessagePort } = require("node:worker_threads");
const { webcrypto } = require("node:crypto");
const fakeIdb = require("fake-indexeddb");
const v8 = require("node:v8");
const { TextDecoder, TextEncoder } = require("node:util");

if (typeof globalThis.MessageChannel === "undefined") {
	globalThis.MessageChannel = MessageChannel;
}
if (typeof globalThis.MessagePort === "undefined") {
	globalThis.MessagePort = MessagePort;
}
if (!globalThis.crypto?.subtle) {
	Object.defineProperty(globalThis, "crypto", {
		value: webcrypto,
		configurable: true,
	});
}
if (typeof globalThis.structuredClone === "undefined") {
	globalThis.structuredClone = (value) => v8.deserialize(v8.serialize(value));
}
globalThis.IDBKeyRange = fakeIdb.IDBKeyRange;
globalThis.indexedDB = new fakeIdb.IDBFactory();
globalThis.TextDecoder ??= TextDecoder;
globalThis.TextEncoder ??= TextEncoder;
