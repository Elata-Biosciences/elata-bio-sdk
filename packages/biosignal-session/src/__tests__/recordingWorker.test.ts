import { createLoopbackPortPair, createMemoryHost, settleMicrotasks } from "../testing/memoryHost";
import {
	RECORDING_WORKER_TICK_MS,
	bindRecordingWorker,
} from "../worker/recordingWorker";
import type { RecordingWorkerScope } from "../worker/recordingWorker";
import type { RecorderWorkerToClient } from "../worker/workerMessages";

function fakeScope() {
	const posted: RecorderWorkerToClient[] = [];
	const scope: RecordingWorkerScope & { posted: RecorderWorkerToClient[] } = {
		onmessage: null,
		postMessage(message: unknown) {
			posted.push(message as RecorderWorkerToClient);
		},
		posted,
	};
	return scope;
}

describe("bindRecordingWorker", () => {
	it("binds onmessage, forwards emissions, and schedules the tick interval", () => {
		const scope = fakeScope();
		const intervals: { callback: () => void; ms: number }[] = [];
		const bound = bindRecordingWorker(scope, {
			setIntervalFn: (callback, ms) => {
				intervals.push({ callback, ms });
				return 42;
			},
			clearIntervalFn: () => {},
			now: () => 0,
		});
		expect(typeof scope.onmessage).toBe("function");
		expect(intervals).toHaveLength(1);
		expect(intervals[0].ms).toBe(RECORDING_WORKER_TICK_MS);
		expect(bound.core.state()).toBe("idle");
		// A tick before init is a no-op, not a crash.
		intervals[0].callback();
	});

	it("routes messages into the engine — init over a fake scope handshakes", async () => {
		const scope = fakeScope();
		const cleared: unknown[] = [];
		const bound = bindRecordingWorker(scope, {
			setIntervalFn: () => 7,
			clearIntervalFn: (handle) => cleared.push(handle),
			now: () => 0,
		});
		const host = createMemoryHost();
		const [clientPort, hostPort] = createLoopbackPortPair();
		host.attach(hostPort);
		scope.onmessage?.({ data: { t: "init", port: clientPort } });
		await settleMicrotasks();
		expect(bound.core.state()).toBe("ready");
		expect(
			scope.posted.filter((message) => message.t === "state").map((m) => m.state),
		).toEqual(["handshaking", "ready"]);
		bound.dispose();
		expect(cleared).toEqual([7]);
		expect(scope.onmessage).toBeNull();
	});

	it("importing the module in jsdom does not self-bind", () => {
		// jsdom has no importScripts, so module-level self-binding must not
		// have touched the global scope.
		expect(
			(globalThis as { onmessage?: unknown }).onmessage ?? null,
		).toBeNull();
	});
});
