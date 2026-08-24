/**
 * Conformance against the shared golden fixtures. Host implementations (the
 * appstore) hold a verbatim copy of `fixtures/biosignal-protocol-v1.json`
 * and run the same assertions — any schema change must regenerate the
 * fixture and update both repos in a paired change.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { checksumOf, crc32cHex } from "../arrow/checksum";
import { decodeChunk, readFloat32Column, readTimeUsColumn } from "../arrow/decode";
import { isValidName } from "../contracts/ids";
import {
	BIOSIGNAL_INIT_MESSAGE_KIND,
	BIOSIGNAL_PROTOCOL_VERSION,
	CLIENT_OPS,
	isBiosignalInitMessage,
	isClientRequest,
	isHostResponse,
} from "../protocol/messages";

const fixturePath = path.resolve(
	__dirname,
	"..",
	"..",
	"fixtures",
	"biosignal-protocol-v1.json",
);

// biome-ignore lint/suspicious/noExplicitAny: fixture JSON is validated by assertions below
const fixture: any = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

function fromBase64(base64: string): Uint8Array {
	return new Uint8Array(Buffer.from(base64, "base64"));
}

describe("golden protocol fixture", () => {
	it("pins the protocol identity", () => {
		expect(fixture.protocol.version).toBe(BIOSIGNAL_PROTOCOL_VERSION);
		expect(fixture.protocol.initMessageKind).toBe(BIOSIGNAL_INIT_MESSAGE_KIND);
		expect(fixture.protocol.clientOps).toEqual(CLIENT_OPS);
		expect(isBiosignalInitMessage(fixture.protocol.initMessage)).toBe(true);
	});

	it("sample messages satisfy the guards", () => {
		const { sampleMessages } = fixture.protocol;
		expect(isClientRequest(sampleMessages.ping)).toBe(true);
		expect(isHostResponse(sampleMessages.okResponse)).toBe(true);
		expect(isHostResponse(sampleMessages.errorResponse)).toBe(true);
		expect(isHostResponse(sampleMessages.notice)).toBe(true);
	});

	it("name vectors agree with NAME_PATTERN", () => {
		for (const name of fixture.protocol.nameVectors.valid) {
			expect(isValidName(name)).toBe(true);
		}
		for (const name of fixture.protocol.nameVectors.invalid) {
			expect(isValidName(name)).toBe(false);
		}
	});

	it("checksum vectors reproduce", () => {
		const inputs: Record<string, Uint8Array> = {
			"utf8:123456789": new TextEncoder().encode("123456789"),
			"zeros:32": new Uint8Array(32),
			"ones:32": new Uint8Array(32).fill(0xff),
			"ascending:32": Uint8Array.from({ length: 32 }, (_, i) => i),
		};
		for (const vector of fixture.checksum.vectors) {
			expect(crc32cHex(inputs[vector.input])).toBe(vector.hex);
		}
	});

	it("wide chunk decodes to the formula values with the pinned checksum", () => {
		const spec = fixture.chunks.wideF32;
		const bytes = fromBase64(spec.base64);
		expect(bytes.byteLength).toBe(spec.byteLength);
		expect(checksumOf(bytes).value).toBe(spec.checksum);
		const decoded = decodeChunk(bytes);
		expect(decoded.rowCount).toBe(spec.rows);
		expect(decoded.columnNames).toEqual(spec.channels);
		expect(decoded.identity).toEqual({
			sessionId: spec.identity.sessionId,
			streamId: spec.identity.streamId,
			arrowSchemaId: spec.identity.arrowSchemaId,
		});
		spec.channels.forEach((channel: string, ch: number) => {
			const column = readFloat32Column(decoded.table, channel);
			for (let i = 0; i < spec.rows; i++) {
				expect(column[i]).toBeCloseTo(ch * 100 + i * 0.25, 5);
			}
		});
	});

	it("rppg-metrics chunk decodes to the pinned rows", () => {
		const spec = fixture.chunks.rppgMetrics;
		const bytes = fromBase64(spec.base64);
		expect(checksumOf(bytes).value).toBe(spec.checksum);
		const decoded = decodeChunk(bytes);
		expect(decoded.rowCount).toBe(spec.rows.length);
		expect(readTimeUsColumn(decoded.table)).toEqual(
			spec.rows.map((row: { time_us: number }) => row.time_us),
		);
		expect(decoded.table.getChild("fused_source")?.get(1)).toBe("blend");
		expect(decoded.table.getChild("confidence")?.get(1)).toBeNull();
	});
});
