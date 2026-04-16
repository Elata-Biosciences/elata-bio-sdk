import type {
	HeadbandTransport,
	HeadbandTransportStatus,
} from "@elata-biosciences/eeg-web";
import type { MuseDeviceOptions } from "@elata-biosciences/eeg-web-ble";
import { BleTransport } from "@elata-biosciences/eeg-web-ble";
import {
	PpgProcessor,
	type PpgChannelPreference,
	type PpgDebugSnapshot,
	type PpgMetrics,
	type PpgProcessorOptions,
	type PpgSourcePreference,
	type PpgTraceSnapshot,
} from "./ppgProcessor";

export interface CreatePpgSessionOptions extends PpgProcessorOptions {
	transport: HeadbandTransport;
	autoStart?: boolean;
	onMetrics?: (metrics: PpgMetrics) => void;
	onDiagnostics?: (diagnostics: PpgSessionDiagnostics) => void;
	onStatus?: (status: HeadbandTransportStatus) => void;
}

export interface CreateMusePpgSessionOptions
	extends Omit<CreatePpgSessionOptions, "transport"> {
	deviceOptions?: MuseDeviceOptions;
	sourceName?: string;
}

export interface PpgSessionDiagnostics {
	transportStatus: HeadbandTransportStatus | null;
	lastFrameAtMs: number | null;
	lastFrameAgeMs: number | null;
	lastSampleTimestampMs: number | null;
	lastSampleAgeMs: number | null;
	issues: PpgDebugSnapshot["issues"];
	metrics: PpgMetrics;
	debug: PpgDebugSnapshot;
}

type SessionInternals = {
	onMetrics?: (metrics: PpgMetrics) => void;
	onDiagnostics?: (diagnostics: PpgSessionDiagnostics) => void;
	onStatus?: (status: HeadbandTransportStatus) => void;
	restoreHandlers: () => void;
};

export class PpgSession {
	private lastStatus: HeadbandTransportStatus | null = null;

	constructor(
		public readonly transport: HeadbandTransport,
		public readonly processor: PpgProcessor,
		private readonly internals: SessionInternals,
	) {}

	getMetrics(): PpgMetrics {
		return this.processor.getMetrics();
	}

	getDebugSnapshot(): PpgDebugSnapshot {
		return this.processor.getDebugSnapshot();
	}

	getTraceSnapshot(maxPoints = 300): PpgTraceSnapshot {
		return this.processor.getTraceSnapshot(maxPoints);
	}

	getDiagnostics(nowMs = Date.now()): PpgSessionDiagnostics {
		const debug = this.processor.getDebugSnapshot();
		const metrics = this.processor.getMetrics();
		return {
			transportStatus: this.lastStatus,
			lastFrameAtMs: debug.lastFrameAtMs,
			lastFrameAgeMs:
				debug.lastFrameAtMs != null ? Math.max(0, nowMs - debug.lastFrameAtMs) : null,
			lastSampleTimestampMs: metrics.lastSampleTimestampMs,
			lastSampleAgeMs:
				metrics.lastSampleTimestampMs != null
					? Math.max(0, nowMs - metrics.lastSampleTimestampMs)
					: null,
			issues: debug.issues,
			metrics,
			debug,
		};
	}

	async start(): Promise<void> {
		await this.transport.connect();
		await this.transport.start();
		this.emitDiagnostics();
	}

	async stop(): Promise<void> {
		await this.transport.stop();
		this.emitDiagnostics();
	}

	async disconnect(): Promise<void> {
		await this.transport.disconnect();
		this.emitDiagnostics();
	}

	async dispose(): Promise<void> {
		try {
			await this.stop();
		} catch {}
		try {
			await this.disconnect();
		} catch {}
		this.internals.restoreHandlers();
	}

	recordStatus(status: HeadbandTransportStatus): void {
		this.lastStatus = status;
		this.internals.onStatus?.(status);
		this.emitDiagnostics();
	}

	emitDiagnostics(): void {
		const metrics = this.processor.getMetrics();
		this.internals.onMetrics?.(metrics);
		this.internals.onDiagnostics?.(this.getDiagnostics());
	}
}

export async function createPpgSession(
	options: CreatePpgSessionOptions,
): Promise<PpgSession> {
	const processor = new PpgProcessor({
		windowSec: options.windowSec,
		source: options.source,
		channel: options.channel,
	});
	const previousOnFrame = options.transport.onFrame;
	const previousOnStatus = options.transport.onStatus;

	let session: PpgSession | null = null;
	options.transport.onFrame = (frame) => {
		previousOnFrame?.(frame);
		processor.pushFrame(frame);
		session?.emitDiagnostics();
	};
	options.transport.onStatus = (status) => {
		previousOnStatus?.(status);
		session?.recordStatus(status);
	};

	session = new PpgSession(options.transport, processor, {
		onMetrics: options.onMetrics,
		onDiagnostics: options.onDiagnostics,
		onStatus: options.onStatus,
		restoreHandlers: () => {
			options.transport.onFrame = previousOnFrame;
			options.transport.onStatus = previousOnStatus;
		},
	});

	if (options.autoStart !== false) {
		await session.start();
	}

	return session;
}

export async function createMusePpgSession(
	options: CreateMusePpgSessionOptions = {},
): Promise<PpgSession> {
	const transport = new BleTransport({
		deviceOptions: options.deviceOptions,
		sourceName: options.sourceName ?? "muse-ppg",
	});
	return createPpgSession({
		transport,
		autoStart: options.autoStart,
		windowSec: options.windowSec,
		source: options.source,
		channel: options.channel,
		onMetrics: options.onMetrics,
		onDiagnostics: options.onDiagnostics,
		onStatus: options.onStatus,
	});
}

export type {
	PpgChannelPreference,
	PpgMetrics,
	PpgProcessorOptions,
	PpgSourcePreference,
};
