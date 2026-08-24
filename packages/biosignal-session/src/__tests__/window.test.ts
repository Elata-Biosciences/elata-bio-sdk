import { BIOSIGNAL_LIMITS } from "../protocol/messages";
import { createInFlightWindow } from "../protocol/window";

describe("in-flight window", () => {
	it("defaults to the protocol window of 4 chunks per stream", () => {
		const window = createInFlightWindow();
		for (let i = 0; i < BIOSIGNAL_LIMITS.defaultInFlightWindow; i++) {
			expect(window.canSend("s1")).toBe(true);
			window.markInFlight("s1");
		}
		expect(window.canSend("s1")).toBe(false);
		expect(window.inFlightCount("s1")).toBe(4);
	});

	it("tracks streams independently", () => {
		const window = createInFlightWindow({ inFlightWindow: 2 });
		window.markInFlight("s1");
		window.markInFlight("s1");
		expect(window.canSend("s1")).toBe(false);
		expect(window.canSend("s2")).toBe(true);
		expect(window.totalInFlight()).toBe(2);
	});

	it("frees a slot on ACK and never goes negative", () => {
		const window = createInFlightWindow({ inFlightWindow: 1 });
		window.markInFlight("s1");
		expect(window.canSend("s1")).toBe(false);
		window.ackInFlight("s1");
		expect(window.canSend("s1")).toBe(true);
		window.ackInFlight("s1");
		expect(window.inFlightCount("s1")).toBe(0);
	});

	it("supports windows of 2, 4, and 8", () => {
		for (const size of [2, 4, 8]) {
			const window = createInFlightWindow({ inFlightWindow: size });
			for (let i = 0; i < size; i++) window.markInFlight("s");
			expect(window.canSend("s")).toBe(false);
			window.ackInFlight("s");
			expect(window.canSend("s")).toBe(true);
		}
	});
});

describe("buffer pressure accounting", () => {
	it("starts at ok with zero buffered bytes", () => {
		const window = createInFlightWindow();
		expect(window.bufferedBytes()).toBe(0);
		expect(window.pressure()).toBe("ok");
	});

	it("reports degraded at the soft limit and ok again after release", () => {
		const window = createInFlightWindow({
			softBufferBytes: 100,
			hardBufferBytes: 200,
		});
		window.addBufferedBytes(99);
		expect(window.pressure()).toBe("ok");
		window.addBufferedBytes(1);
		expect(window.pressure()).toBe("degraded");
		window.releaseBufferedBytes(50);
		expect(window.pressure()).toBe("ok");
		expect(window.bufferedBytes()).toBe(50);
	});

	it("reports stalled at the hard limit — the caller must abort, never drop", () => {
		const window = createInFlightWindow({
			softBufferBytes: 100,
			hardBufferBytes: 200,
		});
		window.addBufferedBytes(199);
		expect(window.pressure()).toBe("degraded");
		window.addBufferedBytes(1);
		expect(window.pressure()).toBe("stalled");
	});

	it("uses the protocol soft/hard limits by default", () => {
		const window = createInFlightWindow();
		window.addBufferedBytes(BIOSIGNAL_LIMITS.softBufferBytes);
		expect(window.pressure()).toBe("degraded");
		window.addBufferedBytes(
			BIOSIGNAL_LIMITS.hardBufferBytes - BIOSIGNAL_LIMITS.softBufferBytes,
		);
		expect(window.pressure()).toBe("stalled");
	});

	it("clamps byte release at zero", () => {
		const window = createInFlightWindow();
		window.addBufferedBytes(10);
		window.releaseBufferedBytes(25);
		expect(window.bufferedBytes()).toBe(0);
	});

	it("exposes a consistent snapshot", () => {
		const window = createInFlightWindow({
			inFlightWindow: 2,
			softBufferBytes: 10,
			hardBufferBytes: 20,
		});
		window.markInFlight("a");
		window.markInFlight("b");
		window.addBufferedBytes(12);
		expect(window.snapshot()).toEqual({
			inFlight: 2,
			bufferedBytes: 12,
			degraded: true,
			stalled: false,
		});
	});

	it("forgets a stream entirely once cleared", () => {
		const window = createInFlightWindow({ inFlightWindow: 1 });
		window.markInFlight("s1");
		window.clearStream("s1");
		expect(window.inFlightCount("s1")).toBe(0);
		expect(window.totalInFlight()).toBe(0);
		expect(window.canSend("s1")).toBe(true);
	});
});
