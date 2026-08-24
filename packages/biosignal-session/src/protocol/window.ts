/**
 * Pure in-flight window and buffer-pressure accounting (client side).
 *
 * At most `inFlightWindow` unACKed chunks per stream may be in flight.
 * Encoded-but-unACKed bytes (in flight or queued) are tracked globally:
 * crossing the soft limit means "degraded" (the recorder flags quality and
 * keeps buffering — biosignal data is never silently dropped); crossing the
 * hard limit means "stalled" (the recorder must abort the session with
 * `storage_stalled`, an explicit and recorded failure).
 */

import { BIOSIGNAL_LIMITS } from "./messages";

export interface InFlightWindowConfig {
	inFlightWindow: number;
	softBufferBytes: number;
	hardBufferBytes: number;
}

export type BufferPressure = "ok" | "degraded" | "stalled";

export interface WindowSnapshot {
	inFlight: number;
	bufferedBytes: number;
	degraded: boolean;
	stalled: boolean;
}

export interface InFlightWindow {
	canSend(streamId: string): boolean;
	markInFlight(streamId: string): void;
	ackInFlight(streamId: string): void;
	inFlightCount(streamId: string): number;
	totalInFlight(): number;
	clearStream(streamId: string): void;
	addBufferedBytes(bytes: number): void;
	releaseBufferedBytes(bytes: number): void;
	bufferedBytes(): number;
	pressure(): BufferPressure;
	snapshot(): WindowSnapshot;
}

export function createInFlightWindow(
	config: Partial<InFlightWindowConfig> = {},
): InFlightWindow {
	const inFlightWindow =
		config.inFlightWindow ?? BIOSIGNAL_LIMITS.defaultInFlightWindow;
	const softBufferBytes =
		config.softBufferBytes ?? BIOSIGNAL_LIMITS.softBufferBytes;
	const hardBufferBytes =
		config.hardBufferBytes ?? BIOSIGNAL_LIMITS.hardBufferBytes;

	const inFlightByStream = new Map<string, number>();
	let buffered = 0;

	const pressure = (): BufferPressure => {
		if (buffered >= hardBufferBytes) return "stalled";
		if (buffered >= softBufferBytes) return "degraded";
		return "ok";
	};

	return {
		canSend(streamId) {
			return (inFlightByStream.get(streamId) ?? 0) < inFlightWindow;
		},
		markInFlight(streamId) {
			inFlightByStream.set(streamId, (inFlightByStream.get(streamId) ?? 0) + 1);
		},
		ackInFlight(streamId) {
			const current = inFlightByStream.get(streamId) ?? 0;
			if (current <= 1) inFlightByStream.delete(streamId);
			else inFlightByStream.set(streamId, current - 1);
		},
		inFlightCount(streamId) {
			return inFlightByStream.get(streamId) ?? 0;
		},
		totalInFlight() {
			let total = 0;
			for (const count of inFlightByStream.values()) total += count;
			return total;
		},
		clearStream(streamId) {
			inFlightByStream.delete(streamId);
		},
		addBufferedBytes(bytes) {
			buffered += bytes;
		},
		releaseBufferedBytes(bytes) {
			buffered = Math.max(0, buffered - bytes);
		},
		bufferedBytes() {
			return buffered;
		},
		pressure,
		snapshot() {
			const level = pressure();
			return {
				inFlight: this.totalInFlight(),
				bufferedBytes: buffered,
				degraded: level !== "ok",
				stalled: level === "stalled",
			};
		},
	};
}
