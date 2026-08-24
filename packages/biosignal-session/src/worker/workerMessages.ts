/**
 * Internal UI-thread ↔ recording-worker message contract.
 *
 * This is NOT the wire protocol (`protocol/messages.ts`) — it is the private
 * contract between `recorderClient` (UI thread) and the recording engine
 * (`recorderCore`, normally hosted by `recordingWorker`). Streams are keyed
 * by a caller-chosen `clientStreamId` because host-assigned stream ids only
 * exist after the async `stream/open` round trip.
 */

import type {
	ClockObservationDraft,
	SessionEventDraft,
	StreamDescriptorDraft,
} from "../contracts/session";
import type { DiscontinuityV1, SessionUs } from "../contracts/time";
import type { BiosignalClientErrorCode } from "../protocol/errors";
import type { QuotaUsage, SessionCreateSpec } from "../protocol/messages";
import type { ClientSessionState } from "../protocol/stateMachine";

/**
 * Minimal structural port the engine talks to the host through. A real
 * `MessagePort` satisfies it; tests inject in-memory ports.
 */
export interface ProtocolPort {
	postMessage(message: unknown, transfer?: Transferable[]): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	start?(): void;
	close?(): void;
}

/** Engine tunables — every value defaults to `BIOSIGNAL_LIMITS`. */
export interface RecorderConfig {
	inFlightWindow?: number;
	softBufferBytes?: number;
	hardBufferBytes?: number;
	chunkTargetBytes?: number;
	chunkMaxDurationUs?: number;
	ackTimeoutMs?: number;
	heartbeatIntervalMs?: number;
}

export type ClientToRecorderWorker =
	| { t: "init"; port: ProtocolPort; config?: RecorderConfig }
	| { t: "session/start"; spec: SessionCreateSpec }
	| { t: "stream/open"; clientStreamId: string; draft: StreamDescriptorDraft }
	| {
			t: "samples";
			clientStreamId: string;
			sampleIndex0: number;
			timeUs0: SessionUs;
			rows: number;
			channels: number;
			/** Float32 row-major (`samples[row][channel]` flattened), transferred. */
			data: ArrayBuffer;
	  }
	| {
			t: "irregular";
			clientStreamId: string;
			rows: number;
			/** Float64 per-row session µs, transferred. */
			timesUs: ArrayBuffer;
			/** Float32 row-major values, transferred. */
			data: ArrayBuffer;
	  }
	| {
			t: "metricRow";
			clientStreamId: string;
			timeUs: SessionUs;
			row: Record<string, unknown>;
	  }
	| { t: "event"; events: SessionEventDraft[] }
	| { t: "clock"; observations: ClockObservationDraft[] }
	| {
			t: "discontinuityHint";
			clientStreamId: string;
			reason: NonNullable<DiscontinuityV1["reason"]>;
	  }
	| { t: "stream/close"; clientStreamId: string; endUs: SessionUs }
	| { t: "session/stop"; mode: "finalize" | "abort"; reason?: string }
	| { t: "flush" };

export interface RecorderClosedSummary {
	sessionId: string | null;
	endUs: SessionUs;
	totalChunks: number;
	totalBytes: number;
	endReason: string;
}

export type RecorderWorkerToClient =
	| { t: "state"; state: ClientSessionState; sessionId?: string }
	| {
			t: "stream-open";
			clientStreamId: string;
			streamId: string;
	  }
	| {
			t: "progress";
			committedChunks: number;
			committedBytes: number;
			bufferedBytes: number;
			inFlight: number;
			usage?: QuotaUsage;
	  }
	| {
			t: "error";
			code: BiosignalClientErrorCode;
			retryable: boolean;
			detail?: string;
	  }
	| { t: "closed"; summary: RecorderClosedSummary };
