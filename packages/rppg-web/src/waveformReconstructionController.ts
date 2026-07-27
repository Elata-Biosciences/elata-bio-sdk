import {
	WaveformModelError,
	type RppgModelDiagnosticsV1,
	type RppgModelFallbackReason,
	type WaveformFeatureWindowV1,
	type WaveformReconstructionV1,
	type WaveformReconstructor,
} from "./waveformModel";

export class WaveformReconstructionController {
	private busy = false;
	private lastStartedAt = 0;
	private abort = new AbortController();
	private generation = 0;
	private terminal = false;
	private restartable = false;
	private lifecycleTask: Promise<void> | null = null;
	private inferenceTask: Promise<void> | null = null;
	private latest: WaveformReconstructionV1 | null = null;
	private diagnostics: RppgModelDiagnosticsV1;

	constructor(
		private readonly reconstructor: WaveformReconstructor,
		private readonly inferenceIntervalMs = 1000,
	) {
		this.diagnostics = {
			modelId: reconstructor.manifest.id,
			modelStatus: "loading",
			inputProfileId: reconstructor.manifest.input.profileId,
			lastInferenceMs: null,
			lastInferenceAtMs: null,
			inputSampleCount: 0,
			skippedInferenceCount: 0,
			fallbackReason: null,
			reconstructionReliability: null,
		};
	}

	async init(): Promise<void> {
		if (this.terminal) return;
		if (this.lifecycleTask) return this.lifecycleTask;
		if (this.restartable) {
			this.abort = new AbortController();
			this.restartable = false;
			this.diagnostics.modelStatus = "loading";
			this.diagnostics.fallbackReason = null;
		}
		if (this.diagnostics.modelStatus !== "loading") return;
		const generation = ++this.generation;
		const task = this.initialize(generation);
		this.lifecycleTask = task;
		await task;
		if (this.lifecycleTask === task) this.lifecycleTask = null;
	}

	offer(window: WaveformFeatureWindowV1, nowMs = Date.now()): boolean {
		if (
			!["ready", "degraded"].includes(this.diagnostics.modelStatus) ||
			this.busy ||
			nowMs - this.lastStartedAt < this.inferenceIntervalMs
		) {
			this.diagnostics.skippedInferenceCount += 1;
			return false;
		}
		this.busy = true;
		this.lastStartedAt = nowMs;
		this.diagnostics.modelStatus = "running";
		this.diagnostics.inputSampleCount = window.length;
		const task = this.run(window, nowMs, this.generation);
		this.inferenceTask = task;
		void task.finally(() => {
			if (this.inferenceTask === task) this.inferenceTask = null;
		});
		return true;
	}

	reportInputUnavailable(
		reason: RppgModelFallbackReason,
		inputSampleCount = 0,
	): void {
		if (this.terminal || this.busy) return;
		this.diagnostics.inputSampleCount = inputSampleCount;
		this.diagnostics.fallbackReason = reason;
		if (this.diagnostics.modelStatus === "ready") {
			this.diagnostics.modelStatus = "degraded";
		}
	}

	getLatest(): WaveformReconstructionV1 | null {
		return this.latest;
	}

	getDiagnostics(): RppgModelDiagnosticsV1 {
		return { ...this.diagnostics };
	}

	async stop(): Promise<void> {
		await this.shutdown(false);
	}

	async dispose(): Promise<void> {
		await this.shutdown(true);
	}

	private async initialize(generation: number): Promise<void> {
		try {
			await this.reconstructor.init(this.abort.signal);
			if (generation !== this.generation || this.terminal) return;
			this.diagnostics.modelStatus = "ready";
		} catch {
			if (generation !== this.generation || this.terminal) return;
			this.diagnostics.modelStatus = "failed";
			this.diagnostics.fallbackReason = "model_init_failed";
		}
	}

	private async shutdown(terminal: boolean): Promise<void> {
		if (terminal && this.terminal) return;
		if (!terminal && this.restartable) return;
		if (terminal && this.restartable) {
			this.terminal = true;
			this.restartable = false;
			return;
		}
		this.terminal = this.terminal || terminal;
		this.restartable = !this.terminal;
		this.generation += 1;
		this.abort.abort();
		await Promise.allSettled(
			[this.lifecycleTask, this.inferenceTask].filter(
				(task): task is Promise<void> => task != null,
			),
		);
		try {
			await this.reconstructor.dispose();
		} catch {
			// Model cleanup must not poison the deterministic session lifecycle.
		}
		this.busy = false;
		this.latest = null;
		this.diagnostics.modelStatus = "disposed";
		this.diagnostics.fallbackReason = null;
		this.diagnostics.reconstructionReliability = null;
	}

	private async run(
		window: WaveformFeatureWindowV1,
		startedAt: number,
		generation: number,
	) {
		try {
			const latest = await this.reconstructor.reconstruct(
				window,
				this.abort.signal,
			);
			if (generation !== this.generation || this.terminal || this.restartable)
				return;
			this.latest = latest;
			this.diagnostics.modelStatus = latest ? "ready" : "degraded";
			this.diagnostics.fallbackReason = latest
				? null
				: "reconstruction_unavailable";
			this.diagnostics.reconstructionReliability = latest?.reliability ?? null;
		} catch (error) {
			if (generation !== this.generation || this.terminal || this.restartable)
				return;
			this.diagnostics.modelStatus = "degraded";
			this.diagnostics.fallbackReason =
				error instanceof WaveformModelError ? error.code : "inference_failed";
		} finally {
			if (
				generation === this.generation &&
				!this.terminal &&
				!this.restartable
			) {
				this.diagnostics.lastInferenceAtMs = startedAt;
				this.diagnostics.lastInferenceMs = Math.max(0, Date.now() - startedAt);
				this.busy = false;
			}
		}
	}
}
