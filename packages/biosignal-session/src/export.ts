import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type {
	SessionEventV1,
	SessionManifestV1,
	SessionSummaryV1,
} from "./contracts";
import { SessionError } from "./errors";
import { sha256Hex } from "./hash";
import type { SessionStore } from "./storage";
import { validateEvent, validateManifest } from "./validation";

const MANIFEST_PATH = "manifest.json";
const EVENTS_PATH = "events.ndjson";
const SUMMARY_PATH = "summary.json";
const CHECKSUMS_PATH = "checksums.sha256";

function chunkPath(streamId: string, sequence: number): string {
	return `chunks/${encodeURIComponent(streamId)}/${sequence.toString().padStart(10, "0")}.arrow`;
}

export async function exportSessionArchive(
	store: SessionStore,
	scopeId: string,
	sessionId: string,
): Promise<Uint8Array> {
	const manifest = await store.getManifest(scopeId, sessionId);
	if (!manifest)
		throw new SessionError("session_not_found", "Session was not found");
	validateManifest(manifest);
	const files: Record<string, Uint8Array> = {};
	files[MANIFEST_PATH] = strToU8(JSON.stringify(manifest, null, 2));
	const events = await store.listEvents(scopeId, sessionId);
	files[EVENTS_PATH] = strToU8(
		events.map((event) => JSON.stringify(event)).join("\n") +
			(events.length ? "\n" : ""),
	);
	const summary = await store.getSummary(scopeId, sessionId);
	if (summary) files[SUMMARY_PATH] = strToU8(JSON.stringify(summary, null, 2));
	for (const descriptor of manifest.chunks) {
		const chunk = await store.getChunk(
			scopeId,
			sessionId,
			descriptor.streamId,
			descriptor.sequence,
		);
		if (!chunk)
			throw new SessionError("internal", "Manifest references a missing chunk");
		files[chunkPath(descriptor.streamId, descriptor.sequence)] = chunk.payload;
	}
	const checksums: string[] = [];
	for (const path of Object.keys(files).sort())
		checksums.push(`${await sha256Hex(files[path])}  ${path}`);
	files[CHECKSUMS_PATH] = strToU8(`${checksums.join("\n")}\n`);
	return zipSync(files, { level: 6 });
}

export interface ImportSessionArchiveOptions {
	scopeId: string;
	store: SessionStore;
}

export async function importSessionArchive(
	archive: Uint8Array,
	options: ImportSessionArchiveOptions,
): Promise<string> {
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(archive);
	} catch (error) {
		throw new SessionError(
			"invalid_manifest",
			"Session archive is not a valid ZIP",
			error,
		);
	}
	const required = files[MANIFEST_PATH];
	const checksumsFile = files[CHECKSUMS_PATH];
	if (!required || !checksumsFile)
		throw new SessionError(
			"invalid_manifest",
			"Archive is missing manifest or checksums",
		);
	for (const line of strFromU8(checksumsFile).trim().split(/\r?\n/)) {
		if (!line) continue;
		const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
		if (!match || !files[match[2]])
			throw new SessionError(
				"checksum_mismatch",
				"Invalid archive checksum index",
			);
		if ((await sha256Hex(files[match[2]])) !== match[1])
			throw new SessionError(
				"checksum_mismatch",
				`Checksum failed for ${match[2]}`,
			);
	}
	let manifest: SessionManifestV1;
	try {
		manifest = JSON.parse(strFromU8(required)) as SessionManifestV1;
	} catch (error) {
		throw new SessionError(
			"invalid_manifest",
			"Manifest JSON is invalid",
			error,
		);
	}
	validateManifest(manifest);
	const base: SessionManifestV1 = {
		...structuredClone(manifest),
		status: "recording",
		endedAt: undefined,
		durationUs: undefined,
		streams: [],
		chunks: [],
	};
	await options.store.create(options.scopeId, base);
	try {
		for (const stream of manifest.streams)
			await options.store.addStream(
				options.scopeId,
				manifest.sessionId,
				stream,
			);
		for (const descriptor of manifest.chunks) {
			const payload =
				files[chunkPath(descriptor.streamId, descriptor.sequence)];
			if (!payload)
				throw new SessionError(
					"invalid_manifest",
					"Archive is missing a declared chunk",
				);
			await options.store.putChunk(options.scopeId, { descriptor, payload });
		}
		const eventsText = files[EVENTS_PATH]
			? strFromU8(files[EVENTS_PATH]).trim()
			: "";
		for (const line of eventsText ? eventsText.split(/\r?\n/) : []) {
			const event = JSON.parse(line) as SessionEventV1;
			validateEvent(event);
			await options.store.appendEvent(options.scopeId, event);
		}
		if (files[SUMMARY_PATH]) {
			const summary = JSON.parse(
				strFromU8(files[SUMMARY_PATH]),
			) as SessionSummaryV1;
			if (summary.sessionId !== manifest.sessionId)
				throw new SessionError(
					"invalid_manifest",
					"Summary belongs to another session",
				);
			await options.store.putSummary(options.scopeId, summary);
		}
		const status =
			manifest.status === "recording" ? "interrupted" : manifest.status;
		await options.store.setStatus(
			options.scopeId,
			manifest.sessionId,
			status,
			manifest.endedAt,
		);
		return manifest.sessionId;
	} catch (error) {
		await options.store
			.delete(options.scopeId, manifest.sessionId)
			.catch(() => undefined);
		throw error;
	}
}
