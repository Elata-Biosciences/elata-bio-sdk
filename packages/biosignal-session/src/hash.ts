import type { SessionStreamV1 } from "./contracts";
import { SessionError } from "./errors";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	if (!globalThis.crypto?.subtle) {
		throw new SessionError(
			"not_supported",
			"Web Crypto SHA-256 is unavailable",
		);
	}
	const copy = Uint8Array.from(bytes);
	const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
	return Array.from(new Uint8Array(digest), (value) =>
		value.toString(16).padStart(2, "0"),
	).join("");
}

export function canonicalStreamSchema(stream: SessionStreamV1): string {
	return JSON.stringify({
		streamId: stream.streamId,
		sourceId: stream.sourceId,
		modality: stream.modality,
		kind: stream.kind,
		schemaVersion: stream.schemaVersion,
		timing: stream.timing,
		fields: stream.fields,
	});
}

export function streamSchemaSha256(stream: SessionStreamV1): Promise<string> {
	return sha256Hex(new TextEncoder().encode(canonicalStreamSchema(stream)));
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.byteLength !== right.byteLength) return false;
	for (let index = 0; index < left.byteLength; index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}
