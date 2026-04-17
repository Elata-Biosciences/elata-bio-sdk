import { initEegWasm, wasm } from "./runtime";
import type {
	HeadbandEegDetrendMode,
	HeadbandEegProcessingDetails,
	HeadbandEegReferenceMode,
	HeadbandFrameV1,
	HeadbandSignalBlock,
} from "./headband";

type WasmEegPreprocessorLike = {
	process(data: Float32Array): Float32Array;
	update_layout(sampleRateHz: number, channelCount: number): void;
	reset(): void;
	enabled: boolean;
	preserve_raw: boolean;
	reference_mode(): string;
	detrend_mode(): string;
	notch_frequencies_hz(): Float32Array | number[];
	free(): void;
};

export interface EegReferenceOptions {
	mode?: HeadbandEegReferenceMode;
	channels?: Array<number | string>;
}

export interface EegDetrendOptions {
	mode?: HeadbandEegDetrendMode;
	cutoffHz?: number;
	qualityFactor?: number;
}

export interface EegNotchOptions {
	mainsHz?: 50 | 60 | null;
	harmonics?: number[];
	qualityFactor?: number;
}

export interface EegProcessingOptions {
	enabled?: boolean;
	preserveRaw?: boolean;
	reference?: EegReferenceOptions | HeadbandEegReferenceMode;
	detrend?: EegDetrendOptions | HeadbandEegDetrendMode;
	notch?: EegNotchOptions | false;
}

type WasmEegProcessingConfig = {
	enabled: boolean;
	preserve_raw: boolean;
	reference: {
		mode: HeadbandEegReferenceMode;
		channels: number[];
	};
	detrend: {
		mode: HeadbandEegDetrendMode;
		cutoff_hz: number;
		q: number;
	};
	notch: {
		mains_hz: number | null;
		harmonics: number[];
		q: number;
	};
};

function normalizeReference(
	reference: EegProcessingOptions["reference"],
	channelNames: string[],
): WasmEegProcessingConfig["reference"] {
	const referenceOptions =
		typeof reference === "string" ? { mode: reference } : reference ?? {};
	const mode = referenceOptions.mode ?? "common-average";
	const channels = (referenceOptions.channels ?? [])
		.map((channel) =>
			typeof channel === "number"
				? channel
				: channelNames.findIndex((channelName) => channelName === channel),
		)
		.filter((channel) => Number.isInteger(channel) && channel >= 0) as number[];
	return { mode, channels };
}

function normalizeDetrend(
	detrend: EegProcessingOptions["detrend"],
): WasmEegProcessingConfig["detrend"] {
	const detrendOptions =
		typeof detrend === "string" ? { mode: detrend } : detrend ?? {};
	return {
		mode: detrendOptions.mode ?? "highpass",
		cutoff_hz: detrendOptions.cutoffHz ?? 0.5,
		q: detrendOptions.qualityFactor ?? 0.707,
	};
}

function normalizeNotch(
	notch: EegProcessingOptions["notch"],
): WasmEegProcessingConfig["notch"] {
	if (notch === false) {
		return { mains_hz: null, harmonics: [], q: 20 };
	}
	return {
		mains_hz: notch?.mainsHz ?? 60,
		harmonics: notch?.harmonics ?? [1, 2],
		q: notch?.qualityFactor ?? 20,
	};
}

function toInterleaved(block: HeadbandSignalBlock): Float32Array {
	const out = new Float32Array(block.samples.length * block.channelCount);
	for (let sampleIdx = 0; sampleIdx < block.samples.length; sampleIdx++) {
		const row = block.samples[sampleIdx] ?? [];
		for (let channelIdx = 0; channelIdx < block.channelCount; channelIdx++) {
			out[sampleIdx * block.channelCount + channelIdx] =
				row[channelIdx] ?? 0;
		}
	}
	return out;
}

function fromInterleaved(
	data: ArrayLike<number>,
	channelCount: number,
): number[][] {
	const sampleCount = Math.floor(data.length / channelCount);
	const rows: number[][] = [];
	for (let sampleIdx = 0; sampleIdx < sampleCount; sampleIdx++) {
		const row = new Array<number>(channelCount);
		const base = sampleIdx * channelCount;
		for (let channelIdx = 0; channelIdx < channelCount; channelIdx++) {
			row[channelIdx] = Number(data[base + channelIdx] ?? 0);
		}
		rows.push(row);
	}
	return rows;
}

function cloneSignalBlock(block: HeadbandSignalBlock): HeadbandSignalBlock {
	return {
		...block,
		channelNames: block.channelNames.slice(),
		samples: block.samples.map((row) => row.slice()),
		timestampsMs: block.timestampsMs?.slice(),
	};
}

function normalizeWasmMode(value: string, fallback: string): string {
	if (value === "commonaverage") return "common-average";
	if (value === "customaverage") return "custom-average";
	return value || fallback;
}

export class EegPreprocessor {
	private inner: WasmEegPreprocessorLike | null = null;
	private layoutKey = "";
	private readyPromise: Promise<void> | null = null;

	constructor(private readonly options: EegProcessingOptions = {}) {}

	async ready(): Promise<void> {
		if (this.options.enabled === false) return;
		if (!this.readyPromise) {
			this.readyPromise = initEegWasm().then(() => undefined);
		}
		await this.readyPromise;
	}

	reset(): void {
		this.inner?.reset();
	}

	dispose(): void {
		this.inner?.free();
		this.inner = null;
		this.layoutKey = "";
	}

	processSignalBlock(block: HeadbandSignalBlock): {
		eeg: HeadbandSignalBlock;
		eegRaw?: HeadbandSignalBlock;
		eegProcessing: HeadbandEegProcessingDetails;
	} {
		const rawBlock = cloneSignalBlock(block);
		if (this.options.enabled === false) {
			return {
				eeg: rawBlock,
				eegProcessing: {
					applied: false,
					signalKind: "raw",
					rawAvailable: false,
					referenceMode: "none",
					detrendMode: "off",
					notchFrequenciesHz: [],
					stageOrder: [],
				},
			};
		}

		const inner = this.ensureInner(block);
		const processed = inner.process(toInterleaved(rawBlock));
		const processedBlock: HeadbandSignalBlock = {
			...rawBlock,
			samples: fromInterleaved(processed, rawBlock.channelCount),
		};
		const stageOrder = [
			...(Array.from(inner.notch_frequencies_hz()).length > 0 ? ["notch"] : []),
			...(normalizeWasmMode(inner.detrend_mode(), "off") !== "off"
				? ["detrend"]
				: []),
			...(normalizeWasmMode(inner.reference_mode(), "none") !== "none"
				? ["rereference"]
				: []),
		];

		return {
			eeg: processedBlock,
			eegRaw: inner.preserve_raw ? rawBlock : undefined,
			eegProcessing: {
				applied: true,
				signalKind: "processed",
				rawAvailable: inner.preserve_raw,
				referenceMode: normalizeWasmMode(
					inner.reference_mode(),
					"common-average",
				) as HeadbandEegReferenceMode,
				detrendMode: normalizeWasmMode(
					inner.detrend_mode(),
					"highpass",
				) as HeadbandEegDetrendMode,
				notchFrequenciesHz: Array.from(inner.notch_frequencies_hz()).map(Number),
				stageOrder,
			},
		};
	}

	processFrame(frame: HeadbandFrameV1): HeadbandFrameV1 {
		const { eeg, eegRaw, eegProcessing } = this.processSignalBlock(frame.eegRaw ?? frame.eeg);
		return {
			...frame,
			eeg,
			eegRaw,
			eegProcessing,
		};
	}

	private ensureInner(block: HeadbandSignalBlock): WasmEegPreprocessorLike {
		const layoutKey = `${block.sampleRateHz}:${block.channelCount}:${block.channelNames.join(",")}:${JSON.stringify(
			this.options,
		)}`;
		const Constructor = (wasm as any).WasmEegPreprocessor;
		if (typeof Constructor !== "function") {
			throw new Error(
				"EEG preprocessing is unavailable because the WASM preprocessor export is missing.",
			);
		}

		if (!this.inner || this.layoutKey !== layoutKey) {
			this.inner?.free();
			const config: WasmEegProcessingConfig = {
				enabled: this.options.enabled ?? true,
				preserve_raw: this.options.preserveRaw ?? true,
				reference: normalizeReference(this.options.reference, block.channelNames),
				detrend: normalizeDetrend(this.options.detrend),
				notch: normalizeNotch(this.options.notch),
			};
			this.inner = new Constructor(
				block.sampleRateHz,
				block.channelCount,
				JSON.stringify(config),
			) as WasmEegPreprocessorLike;
			this.layoutKey = layoutKey;
		} else {
			this.inner.update_layout(block.sampleRateHz, block.channelCount);
		}

		return this.inner;
	}
}

export async function createEegPreprocessor(
	options: EegProcessingOptions = {},
): Promise<EegPreprocessor> {
	const processor = new EegPreprocessor(options);
	await processor.ready();
	return processor;
}

export async function processHeadbandFrame(
	frame: HeadbandFrameV1,
	options: EegProcessingOptions = {},
): Promise<HeadbandFrameV1> {
	const processor = await createEegPreprocessor(options);
	try {
		return processor.processFrame(frame);
	} finally {
		processor.dispose();
	}
}
