import type { RppgRoiSampleV1 } from "./roiPixelSampler";
import type { FaceRoiName } from "./roiProfile";
import type { WaveformFeatureWindowV1 } from "./waveformModel";

export const MCD_WAVEFORM_ROIS = [
	"forehead",
	"leftCheek",
	"rightCheek",
	"centralFace",
	"broadFace",
] as const satisfies readonly FaceRoiName[];

export const MCD_WAVEFORM_CHANNELS = MCD_WAVEFORM_ROIS.flatMap((roi) => [
	`roi:${roi}:green`,
	`roi:${roi}:pos`,
	`roi:${roi}:chrom`,
]);

type Point = {
	timestampMs: number;
	r: number;
	g: number;
	b: number;
	skin: number;
	profileId: string;
};

export class WaveformFeatureWindowBuilder {
	private readonly buffers = Object.fromEntries(
		MCD_WAVEFORM_ROIS.map((roi) => [roi, [] as Point[]]),
	) as Record<(typeof MCD_WAVEFORM_ROIS)[number], Point[]>;

	constructor(private readonly capacity = 300) {}

	push(sample: RppgRoiSampleV1): void {
		if (!(sample.roi in this.buffers)) return;
		const buffer = this.buffers[sample.roi as keyof typeof this.buffers];
		buffer.push({
			timestampMs: sample.timestampMs,
			r: sample.rgb.r,
			g: sample.rgb.g,
			b: sample.rgb.b,
			skin: sample.quality.skinFraction,
			profileId: sample.geometryProfileId,
		});
		if (buffer.length > this.capacity)
			buffer.splice(0, buffer.length - this.capacity);
	}

	get sampleCount(): number {
		return Math.min(
			...MCD_WAVEFORM_ROIS.map((roi) => this.buffers[roi].length),
		);
	}

	build(options: {
		profileId: string;
		length?: number;
		minSamples?: number;
		channels?: readonly string[];
		qualityWeightFloor?: number;
	}): WaveformFeatureWindowV1 | null {
		const length = options.length ?? 300;
		const count = Math.min(length, this.sampleCount);
		if (count < (options.minSamples ?? 120)) return null;
		const channels = options.channels ?? MCD_WAVEFORM_CHANNELS;
		const windows = Object.fromEntries(
			MCD_WAVEFORM_ROIS.map((roi) => [roi, this.buffers[roi].slice(-count)]),
		) as typeof this.buffers;
		if (
			Object.values(windows).some((points) =>
				points.some((point) => point.profileId !== options.profileId),
			)
		) {
			return null;
		}
		const weights = qualityWeights(windows, options.qualityWeightFloor ?? 0.25);
		const data = new Float32Array(channels.length * length);

		for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
			const [, roi, kind] = channels[channelIndex].split(":");
			const points = windows[roi as keyof typeof windows];
			if (!points) return null;
			const values =
				kind === "green"
					? points.map((point) => point.g)
					: kind === "pos"
						? pulseProjection(points, "pos")
						: kind === "chrom"
							? pulseProjection(points, "chrom")
							: null;
			if (!values) return null;
			const normalized = zscore(resample(values, length));
			for (let index = 0; index < length; index++) {
				data[channelIndex * length + index] = normalized[index] * weights[roi]!;
			}
		}

		const reference = windows.forehead;
		const startTimeMs = reference[0].timestampMs;
		const endTimeMs = reference[reference.length - 1].timestampMs;
		return {
			schema: "elata.rppg.waveform-window/v1",
			profileId: options.profileId,
			channels,
			length,
			startTimeMs,
			endTimeMs,
			sourceSampleRate:
				endTimeMs > startTimeMs
					? ((reference.length - 1) * 1000) / (endTimeMs - startTimeMs)
					: 0,
			data,
		};
	}
}

function pulseProjection(points: Point[], kind: "pos" | "chrom"): Float32Array {
	const means = ["r", "g", "b"].map(
		(channel) =>
			points.reduce(
				(sum, point) => sum + point[channel as "r" | "g" | "b"],
				0,
			) / points.length,
	);
	const first = new Float32Array(points.length);
	const second = new Float32Array(points.length);
	for (let index = 0; index < points.length; index++) {
		const r = points[index].r / Math.max(1e-6, means[0]) - 1;
		const g = points[index].g / Math.max(1e-6, means[1]) - 1;
		const b = points[index].b / Math.max(1e-6, means[2]) - 1;
		first[index] = kind === "pos" ? g - b : 3 * r - 2 * g;
		second[index] = kind === "pos" ? g + b - 2 * r : 1.5 * r + g - 1.5 * b;
	}
	const scale = std(first) / (std(second) + 1e-9);
	return first.map((value, index) =>
		kind === "pos"
			? value + scale * second[index]
			: value - scale * second[index],
	);
}

function qualityWeights(
	windows: Record<string, Point[]>,
	floor: number,
): Record<string, number> {
	const values = Object.fromEntries(
		Object.entries(windows).map(([roi, points]) => [
			roi,
			points.reduce((sum, point) => sum + point.skin, 0) / points.length,
		]),
	);
	const min = Math.min(...Object.values(values));
	const max = Math.max(...Object.values(values));
	if (max <= min + 1e-9)
		return Object.fromEntries(Object.keys(values).map((roi) => [roi, 1]));
	return Object.fromEntries(
		Object.entries(values).map(([roi, value]) => [
			roi,
			Math.max(0, Math.min(1, floor)) +
				(1 - Math.max(0, Math.min(1, floor))) * ((value - min) / (max - min)),
		]),
	);
}

function resample(values: ArrayLike<number>, length: number): Float32Array {
	const output = new Float32Array(length);
	if (values.length < 2) return output;
	for (let index = 0; index < length; index++) {
		const position = (index / Math.max(1, length - 1)) * (values.length - 1);
		const left = Math.floor(position);
		const right = Math.min(values.length - 1, left + 1);
		output[index] =
			values[left] * (1 - (position - left)) +
			values[right] * (position - left);
	}
	return output;
}

function zscore(values: ArrayLike<number>): Float32Array {
	const mean =
		Array.from(values).reduce((sum, value) => sum + value, 0) / values.length;
	const deviation = std(values);
	return Float32Array.from(values, (value) =>
		deviation > 1e-8 ? (value - mean) / deviation : 0,
	);
}

function std(values: ArrayLike<number>): number {
	if (!values.length) return 0;
	const mean =
		Array.from(values).reduce((sum, value) => sum + value, 0) / values.length;
	return Math.sqrt(
		Array.from(values).reduce((sum, value) => sum + (value - mean) ** 2, 0) /
			values.length,
	);
}
