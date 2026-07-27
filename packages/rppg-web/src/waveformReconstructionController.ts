import type {
	RppgModelDiagnosticsV1,
	WaveformFeatureWindowV1,
	WaveformReconstructionV1,
	WaveformReconstructor,
} from "./waveformModel";

export class WaveformReconstructionController {
	private busy = false;
	private lastStartedAt = 0;
	private abort = new AbortController();
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
		if (this.diagnostics.modelStatus !== "loading") return;
		try {
			await this.reconstructor.init(this.abort.signal);
			this.diagnostics.modelStatus = "ready";
		} catch {
			this.diagnostics.modelStatus = "failed";
			this.diagnostics.fallbackReason = "model_init_failed";
		}
	}

	offer(window: WaveformFeatureWindowV1, nowMs = Date.now()): boolean {
		if (
			this.diagnostics.modelStatus === "failed" ||
			this.diagnostics.modelStatus === "disposed" ||
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
		void this.run(window, nowMs);
		return true;
	}

	getLatest(): WaveformReconstructionV1 | null {
		return this.latest;
	}

	getDiagnostics(): RppgModelDiagnosticsV1 {
		return { ...this.diagnostics };
	}

	async dispose(): Promise<void> {
		this.abort.abort();
		await this.reconstructor.dispose();
		this.diagnostics.modelStatus = "disposed";
	}

	private async run(window: WaveformFeatureWindowV1, startedAt: number) {
		try {
			this.latest = await this.reconstructor.reconstruct(
				window,
				this.abort.signal,
			);
			this.diagnostics.modelStatus = this.latest ? "ready" : "degraded";
			this.diagnostics.fallbackReason = this.latest
				? null
				: "reconstruction_unavailable";
			this.diagnostics.reconstructionReliability =
				this.latest?.reliability ?? null;
		} catch {
			this.diagnostics.modelStatus = "degraded";
			this.diagnostics.fallbackReason = "inference_failed";
		} finally {
			this.diagnostics.lastInferenceAtMs = startedAt;
			this.diagnostics.lastInferenceMs = Math.max(0, Date.now() - startedAt);
			this.busy = false;
		}
	}
}
