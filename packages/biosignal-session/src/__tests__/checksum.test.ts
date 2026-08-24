import { checksumOf, crc32c, crc32cHex } from "../arrow/checksum";

describe("crc32c", () => {
	// RFC 3720 §B.4 test vectors.
	it("matches the RFC vector for 32 bytes of zeros", () => {
		expect(crc32c(new Uint8Array(32))).toBe(0x8a9136aa);
	});

	it("matches the RFC vector for 32 bytes of 0xff", () => {
		expect(crc32c(new Uint8Array(32).fill(0xff))).toBe(0x62a8ab43);
	});

	it("matches the RFC vector for ascending bytes 0..31", () => {
		const bytes = new Uint8Array(32);
		for (let i = 0; i < 32; i++) bytes[i] = i;
		expect(crc32c(bytes)).toBe(0x46dd794e);
	});

	it('matches the standard check value for "123456789"', () => {
		expect(crc32c(new TextEncoder().encode("123456789"))).toBe(0xe3069283);
	});

	it("formats as 8 lowercase hex chars with leading zeros", () => {
		const hex = crc32cHex(new TextEncoder().encode("123456789"));
		expect(hex).toBe("e3069283");
		expect(crc32cHex(new Uint8Array(0))).toBe("00000000");
	});

	it("checksumOf accepts ArrayBuffer and Uint8Array identically", () => {
		const bytes = new TextEncoder().encode("payload");
		const fromView = checksumOf(bytes);
		const buffer = bytes.buffer.slice(
			bytes.byteOffset,
			bytes.byteOffset + bytes.byteLength,
		);
		const fromBuffer = checksumOf(buffer);
		expect(fromView).toEqual(fromBuffer);
		expect(fromView.algo).toBe("crc32c");
	});
});
