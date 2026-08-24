/**
 * Thin dedicated-worker shell around `RecorderCore`.
 *
 * All engine logic lives in `client/recorderCore.ts` (plain class, no Worker
 * APIs) so tests drive it directly. This module only binds the engine to a
 * worker scope: `onmessage` → `core.handle`, engine emissions →
 * `postMessage`, and a steady tick interval for retries/heartbeat.
 *
 * Importing this module outside a worker is harmless — the self-binding at
 * the bottom only runs inside a real `DedicatedWorkerGlobalScope`.
 */

import { RecorderCore } from "../client/recorderCore";
import type { ClientToRecorderWorker } from "./workerMessages";

export const RECORDING_WORKER_TICK_MS = 500;

/** Structural slice of a dedicated worker scope the shell needs. */
export interface RecordingWorkerScope {
	onmessage: ((event: { data: unknown }) => void) | null;
	postMessage(message: unknown): void;
}

export interface BindRecordingWorkerOptions {
	tickIntervalMs?: number;
	setIntervalFn?: (callback: () => void, ms: number) => unknown;
	clearIntervalFn?: (handle: unknown) => void;
	now?: () => number;
}

export interface BoundRecordingWorker {
	core: RecorderCore;
	dispose(): void;
}

export function bindRecordingWorker(
	scope: RecordingWorkerScope,
	options: BindRecordingWorkerOptions = {},
): BoundRecordingWorker {
	const setIntervalFn =
		options.setIntervalFn ??
		((callback: () => void, ms: number) => setInterval(callback, ms));
	const clearIntervalFn =
		options.clearIntervalFn ??
		((handle: unknown) =>
			clearInterval(handle as ReturnType<typeof setInterval>));
	const core = new RecorderCore({
		emit: (message) => scope.postMessage(message),
		now: options.now,
	});
	scope.onmessage = (event) => {
		core.handle(event.data as ClientToRecorderWorker);
	};
	const interval = setIntervalFn(
		() => core.tick(),
		options.tickIntervalMs ?? RECORDING_WORKER_TICK_MS,
	);
	return {
		core,
		dispose() {
			clearIntervalFn(interval);
			scope.onmessage = null;
		},
	};
}

function isDedicatedWorkerScope(
	candidate: unknown,
): candidate is RecordingWorkerScope {
	if (typeof candidate !== "object" || candidate === null) return false;
	const scope = candidate as {
		importScripts?: unknown;
		postMessage?: unknown;
		document?: unknown;
	};
	return (
		typeof scope.importScripts === "function" &&
		typeof scope.postMessage === "function" &&
		scope.document === undefined
	);
}

// Bound to a local first: TypeScript does not narrow `globalThis` itself
// through a type predicate.
const currentScope: unknown = globalThis;
if (isDedicatedWorkerScope(currentScope)) {
	bindRecordingWorker(currentScope);
}
