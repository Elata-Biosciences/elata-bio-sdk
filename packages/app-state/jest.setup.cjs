// jsdom shims for APIs the client depends on. Production uses native browser
// implementations.
//
// jsdom does provide `globalThis.crypto`, but its older builds lack
// `randomUUID`. Patch it in either way.

const nodeWebCrypto = require("node:crypto").webcrypto;

if (typeof globalThis.crypto === "undefined") {
	globalThis.crypto = nodeWebCrypto;
} else if (typeof globalThis.crypto.randomUUID !== "function") {
	globalThis.crypto.randomUUID = nodeWebCrypto.randomUUID.bind(nodeWebCrypto);
}
