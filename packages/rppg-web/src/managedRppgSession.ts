import {
	createRppgSession,
	type CreateRppgSessionOptions,
	type RppgSession,
	type RppgSessionDiagnostics,
	type RppgSessionError,
} from "./rppgSession";
import type { Metrics, RppgTraceSnapshot } from "./rppgProcessor";

export type ManagedRppgSessionStatus =
	| "idle"
	| "starting"
	| "running"
	| "retrying"
	| "failed"
	| "stopped";

export type ManagedRppgSessionState = {
	status: ManagedRppgSessionStatus;
	retryCount: number;
	maxRetries: number;
	retryDelayMs: number;
	restartOnProcessorFailure: boolean;
	lastError: RppgSessionError | null;
	nextRetryAtMs: number | null;
};

export type CreateManagedRppgSessionOptions = CreateRppgSessionOptions & {
	maxRetries?: number;
	retryDelayMs?: number;
	restartOnProcessorFailure?: boolean;
	onStateChange?: (state: ManagedRppgSessionState) => void;
};

type ManagedRppgSessionInternals = {
	sessionFactory?: (
		options: CreateRppgSessionOptions,
	) => Promise<RppgSession>;
	setTimeoutFn?: typeof setTimeout;
	clearTimeoutFn?: typeof clearTimeout;
};

const DEFAULT_RETRY_DELAY_MS = 1500;
const DEFAULT_MAX_RETRIES = 3;

function safeMetrics(): Metrics {
	return {
		bpm: null,
		confidence: 0,
		signal_quality: 0,
	};
}

function emptyTraceSnapshot(): RppgTraceSnapshot {
	return {
		sampleRate: 0,
		windowSec: 0,
		totalSamplesReceived: 0,
		windowSampleCount: 0,
		windowDurationMs: 0,
		durationSec: 0,
		points: [],
		lastSample: null,
		backendFailure: null,
	};
}

export class ManagedRppgSession {
	private activeSession: RppgSession | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private generation = 0;
	private startPromise: Promise<void> | null = null;
	private stopped = false;
	private lastDiagnosticsValue: RppgSessionDiagnostics | null = null;
	private stateValue: ManagedRppgSessionState;

	constructor(
		private readonly options: CreateManagedRppgSessionOptions,
		private readonly internals: ManagedRppgSessionInternals = {},
	) {
		this.stateValue = {
			status: "idle",
			retryCount: 0,
			maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
			retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
			restartOnProcessorFailure: options.restartOnProcessorFailure !== false,
			lastError: null,
			nextRetryAtMs: null,
		};
	}

	get session(): RppgSession | null {
		return this.activeSession;
	}

	get state(): ManagedRppgSessionState {
		return { ...this.stateValue };
	}

	get lastError(): RppgSessionError | null {
		return this.stateValue.lastError;
	}

	getDiagnostics(): RppgSessionDiagnostics | null {
		return this.lastDiagnosticsValue;
	}

	getMetrics(): Metrics {
		return this.activeSession?.getMetrics() ?? safeMetrics();
	}

	getTraceSnapshot(maxPoints = 300): RppgTraceSnapshot {
		return this.activeSession?.getTraceSnapshot(maxPoints) ?? emptyTraceSnapshot();
	}

	async start(): Promise<void> {
		this.stopped = false;
		if (this.startPromise) return this.startPromise;
		if (this.retryTimer) {
			this.clearRetryTimer();
		}
		this.startPromise = this.startInternal();
		try {
			await this.startPromise;
		} finally {
			this.startPromise = null;
		}
	}

	async restart(): Promise<void> {
		this.stateValue.retryCount = 0;
		await this.stop();
		await this.start();
	}

	async stop(): Promise<void> {
		this.stopped = true;
		this.clearRetryTimer();
		this.generation += 1;
		const session = this.activeSession;
		this.activeSession = null;
		if (session) {
			await session.dispose();
		}
		this.updateState({
			status: "stopped",
			nextRetryAtMs: null,
		});
	}

	async dispose(): Promise<void> {
		await this.stop();
	}

	private async startInternal(): Promise<void> {
		const generation = ++this.generation;
		const retryCount = this.stateValue.retryCount;
		this.updateState({
			status: "starting",
			lastError: null,
			nextRetryAtMs: null,
		});

		const sessionOptions = this.buildSessionOptions(generation);
		const sessionFactory =
			this.internals.sessionFactory ?? createRppgSession;

		try {
			const session = await sessionFactory(sessionOptions);
			if (this.stopped || generation !== this.generation) {
				await session.dispose();
				return;
			}
			this.activeSession = session;
			this.lastDiagnosticsValue = session.getDiagnostics();
			this.updateState({
				status: "running",
				retryCount,
				lastError: null,
				nextRetryAtMs: null,
			});
		} catch (error) {
			const sessionError = normalizeSessionError(error);
			this.updateState({
				status: "failed",
				lastError: sessionError,
				nextRetryAtMs: null,
			});
			throw error;
		}
	}

	private buildSessionOptions(
		generation: number,
	): CreateRppgSessionOptions {
		const {
			maxRetries: _maxRetries,
			retryDelayMs: _retryDelayMs,
			restartOnProcessorFailure: _restartOnProcessorFailure,
			onStateChange: _onStateChange,
			onDiagnostics,
			onError,
			...sessionOptions
		} = this.options;

		return {
			...sessionOptions,
			autoStart: true,
			onDiagnostics: (diagnostics) => {
				if (generation !== this.generation || this.stopped) return;
				this.lastDiagnosticsValue = diagnostics;
				onDiagnostics?.(diagnostics);
			},
			onError: (error) => {
				if (generation !== this.generation || this.stopped) return;
				this.updateState({
					lastError: error,
				});
				onError?.(error);
				void this.handleSessionError(error, generation);
			},
		};
	}

	private async handleSessionError(
		error: RppgSessionError,
		generation: number,
	): Promise<void> {
		if (
			error.code !== "processor_error" ||
			!this.stateValue.restartOnProcessorFailure ||
			this.stopped ||
			generation !== this.generation
		) {
			await this.disposeActiveSession();
			this.updateState({
				status: "failed",
				lastError: error,
				nextRetryAtMs: null,
			});
			return;
		}

		if (this.stateValue.retryCount >= this.stateValue.maxRetries) {
			await this.disposeActiveSession();
			this.updateState({
				status: "failed",
				lastError: error,
				nextRetryAtMs: null,
			});
			return;
		}

		await this.disposeActiveSession();

		const nextRetryAtMs = Date.now() + this.stateValue.retryDelayMs;
		this.updateState({
			status: "retrying",
			lastError: error,
			nextRetryAtMs,
		});

		const setTimeoutFn = this.internals.setTimeoutFn ?? setTimeout;
		this.retryTimer = setTimeoutFn(() => {
			this.retryTimer = null;
			if (this.stopped || generation !== this.generation) return;
			this.stateValue.retryCount += 1;
			void this.start();
		}, this.stateValue.retryDelayMs);
	}

	private clearRetryTimer() {
		if (!this.retryTimer) return;
		const clearTimeoutFn = this.internals.clearTimeoutFn ?? clearTimeout;
		clearTimeoutFn(this.retryTimer);
		this.retryTimer = null;
	}

	private async disposeActiveSession() {
		const currentSession = this.activeSession;
		this.activeSession = null;
		if (currentSession) {
			await currentSession.dispose();
		}
	}

	private updateState(
		patch: Partial<ManagedRppgSessionState>,
	) {
		this.stateValue = {
			...this.stateValue,
			...patch,
		};
		this.options.onStateChange?.(this.state);
	}
}

export async function createManagedRppgSession(
	options: CreateManagedRppgSessionOptions,
): Promise<ManagedRppgSession> {
	const managed = new ManagedRppgSession(options);
	if (options.autoStart !== false) {
		await managed.start();
	}
	return managed;
}

function normalizeSessionError(error: unknown): RppgSessionError {
	if (
		error &&
		typeof error === "object" &&
		"code" in error &&
		"stage" in error &&
		"message" in error
	) {
		return error as RppgSessionError;
	}

	return {
		code: "backend_init_failed",
		stage: "backend",
		message: error instanceof Error ? error.message : "Failed to start managed rPPG session.",
		timestampMs: Date.now(),
		cause: error,
	};
}
