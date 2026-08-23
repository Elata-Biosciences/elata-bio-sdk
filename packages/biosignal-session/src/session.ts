import {
	SESSION_FORMAT,
	SESSION_FORMAT_VERSION,
	type ArrowChunkV1,
	type BeginSessionInputV1,
	type SessionEventV1,
	type SessionManifestV1,
	type SessionSourceV1,
	type SessionStreamV1,
	type SessionSummaryV1,
} from "./contracts";
import { SessionError } from "./errors";
import type { SessionStore } from "./storage";

function identifier(prefix: string): string {
	const random =
		globalThis.crypto?.randomUUID?.() ??
		`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	return `${prefix}:${random}`;
}

export interface BeginSessionOptionsV1 {
	store: SessionStore;
	scopeId: string;
	appId: string;
	input?: BeginSessionInputV1;
}

export class BiosignalSessionRecorder {
	private constructor(
		private readonly store: SessionStore,
		private readonly scopeId: string,
		readonly sessionId: string,
	) {}

	static async begin(
		options: BeginSessionOptionsV1,
	): Promise<BiosignalSessionRecorder> {
		const input = options.input ?? {};
		const startedAt = input.startedAt ?? new Date().toISOString();
		if (!Number.isFinite(Date.parse(startedAt)))
			throw new SessionError("invalid_manifest", "Invalid start time");
		const sessionId = identifier("session");
		const manifest: SessionManifestV1 = {
			format: SESSION_FORMAT,
			formatVersion: SESSION_FORMAT_VERSION,
			sessionId,
			status: "recording",
			startedAt,
			clock: {
				timeUnit: "microsecond",
				wallClockStartIso: startedAt,
				monotonicOriginMs: globalThis.performance?.now?.(),
			},
			app: {
				appId: options.appId,
				activity: input.activity,
				metadata: input.metadata,
			},
			consent: { recording: "granted", ...input.consent },
			sources: input.sources ?? [],
			streams: [],
			chunks: [],
			models: [],
		};
		await options.store.create(options.scopeId, manifest);
		return new BiosignalSessionRecorder(
			options.store,
			options.scopeId,
			sessionId,
		);
	}

	static attach(
		store: SessionStore,
		scopeId: string,
		sessionId: string,
	): BiosignalSessionRecorder {
		return new BiosignalSessionRecorder(store, scopeId, sessionId);
	}

	static async resume(
		store: SessionStore,
		scopeId: string,
		sessionId: string,
	): Promise<BiosignalSessionRecorder> {
		await store.resume(scopeId, sessionId);
		return new BiosignalSessionRecorder(store, scopeId, sessionId);
	}

	addSource(source: SessionSourceV1): Promise<void> {
		return this.store.addSource(this.scopeId, this.sessionId, source);
	}

	addStream(stream: SessionStreamV1): Promise<void> {
		return this.store.addStream(this.scopeId, this.sessionId, stream);
	}

	writeChunk(chunk: ArrowChunkV1): Promise<"committed" | "duplicate"> {
		if (chunk.descriptor.sessionId !== this.sessionId)
			throw new SessionError(
				"invalid_chunk",
				"Chunk belongs to another session",
			);
		return this.store.putChunk(this.scopeId, chunk);
	}

	appendEvent(
		event: Omit<SessionEventV1, "sessionId" | "eventId"> & { eventId?: string },
	): Promise<"committed" | "duplicate"> {
		return this.store.appendEvent(this.scopeId, {
			...event,
			eventId: event.eventId ?? identifier("event"),
			sessionId: this.sessionId,
		});
	}

	putSummary(summary: Omit<SessionSummaryV1, "sessionId">): Promise<void> {
		return this.store.putSummary(this.scopeId, {
			...summary,
			sessionId: this.sessionId,
		});
	}

	finalize(endedAt?: string): Promise<void> {
		return this.store.setStatus(
			this.scopeId,
			this.sessionId,
			"complete",
			endedAt,
		);
	}

	abort(endedAt?: string): Promise<void> {
		return this.store.setStatus(
			this.scopeId,
			this.sessionId,
			"aborted",
			endedAt,
		);
	}

	async manifest(): Promise<SessionManifestV1> {
		const manifest = await this.store.getManifest(this.scopeId, this.sessionId);
		if (!manifest)
			throw new SessionError("session_not_found", "Session was not found");
		return manifest;
	}
}
