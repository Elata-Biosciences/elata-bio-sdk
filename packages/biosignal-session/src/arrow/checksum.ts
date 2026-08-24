/**
 * CRC32C (Castagnoli, polynomial 0x1EDC6F41 reflected as 0x82F63B78).
 *
 * Chosen over `crypto.subtle` SHA-256 because chunk integrity here guards
 * against corruption (not adversaries — payloads never leave the device),
 * and a synchronous table-driven CRC keeps the per-chunk pipeline free of
 * async hops. The host recomputes the checksum over received bytes before
 * committing.
 */

const CRC32C_POLY = 0x82f63b78;

const TABLE: Uint32Array = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? (c >>> 1) ^ CRC32C_POLY : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

/** Raw CRC32C over bytes, as an unsigned 32-bit integer. */
export function crc32c(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = (crc >>> 8) ^ TABLE[(crc ^ bytes[i]) & 0xff];
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** CRC32C formatted as 8 lowercase hex chars — the wire/catalog format. */
export function crc32cHex(bytes: Uint8Array): string {
	return crc32c(bytes).toString(16).padStart(8, "0");
}

export function checksumOf(payload: ArrayBuffer | Uint8Array): {
	algo: "crc32c";
	value: string;
} {
	const bytes =
		payload instanceof Uint8Array ? payload : new Uint8Array(payload);
	return { algo: "crc32c", value: crc32cHex(bytes) };
}
