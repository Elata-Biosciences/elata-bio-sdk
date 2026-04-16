import type {
	HeadbandFrameV1,
	HeadbandTransport,
	HeadbandTransportStatus,
} from "@elata-biosciences/eeg-web";
import { HeadbandTransportState } from "@elata-biosciences/eeg-web";
import { createPpgSession } from "../ppgSession";

function createTransport() {
	const transport: HeadbandTransport & {
		emitFrame: (frame: HeadbandFrameV1) => void;
		emitStatus: (status: HeadbandTransportStatus) => void;
		connect: jest.Mock<Promise<void>, []>;
		start: jest.Mock<Promise<void>, []>;
		stop: jest.Mock<Promise<void>, []>;
		disconnect: jest.Mock<Promise<void>, []>;
	} = {
		onFrame: undefined,
		onStatus: undefined,
		connect: jest.fn(async () => {}),
		start: jest.fn(async () => {}),
		stop: jest.fn(async () => {}),
		disconnect: jest.fn(async () => {}),
		emitFrame(frame: HeadbandFrameV1) {
			this.onFrame?.(frame);
		},
		emitStatus(status: HeadbandTransportStatus) {
			this.onStatus?.(status);
		},
	};
	return transport;
}

function frameAt(emittedAtMs: number, sampleValue: number): HeadbandFrameV1 {
	return {
		schemaVersion: "v1",
		source: "test",
		sequenceId: Math.floor(emittedAtMs),
		emittedAtMs,
		eeg: {
			sampleRateHz: 256,
			channelNames: ["TP9", "AF7", "AF8", "TP10"],
			channelCount: 4,
			samples: [[0, 0, 0, 0]],
		},
		ppgRaw: {
			sampleRateHz: 64,
			channelNames: ["PPG1", "PPG2", "PPG3"],
			channelCount: 3,
			samples: Array.from({ length: 8 }, (_, index) => [
				sampleValue + index,
				sampleValue + 30 * Math.sin(index / 2),
				sampleValue - index,
			]),
		},
	};
}

describe("PpgSession", () => {
	test("auto-start wires transport and emits diagnostics", async () => {
		const transport = createTransport();
		const onDiagnostics = jest.fn();
		const session = await createPpgSession({
			transport,
			autoStart: true,
			onDiagnostics,
		});

		expect(transport.connect).toHaveBeenCalledTimes(1);
		expect(transport.start).toHaveBeenCalledTimes(1);

		transport.emitStatus({
			state: HeadbandTransportState.Streaming,
			atMs: 1000,
		});
		transport.emitFrame(frameAt(1000, 900));

		expect(onDiagnostics).toHaveBeenCalled();
		expect(session.getDiagnostics().transportStatus?.state).toBe("streaming");
	});

	test("dispose restores prior transport handlers", async () => {
		const transport = createTransport();
		const previousOnFrame = jest.fn();
		const previousOnStatus = jest.fn();
		transport.onFrame = previousOnFrame;
		transport.onStatus = previousOnStatus;

		const session = await createPpgSession({
			transport,
			autoStart: false,
		});

		await session.dispose();

		expect(transport.onFrame).toBe(previousOnFrame);
		expect(transport.onStatus).toBe(previousOnStatus);
	});
});
