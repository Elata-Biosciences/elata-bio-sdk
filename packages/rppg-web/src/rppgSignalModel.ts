function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export class ChannelGainController {
	private baseline = { r: 0, g: 0, b: 0 };
	private initialized = false;
	private readonly targetLevel = 110;

	reset() {
		this.initialized = false;
		this.baseline = { r: 0, g: 0, b: 0 };
	}

	process(r: number, g: number, b: number) {
		if (!this.initialized) {
			this.baseline = { r, g, b };
			this.initialized = true;
		}

		this.baseline.r = this.baseline.r * 0.97 + r * 0.03;
		this.baseline.g = this.baseline.g * 0.97 + g * 0.03;
		this.baseline.b = this.baseline.b * 0.97 + b * 0.03;

		const gainR = clamp(
			this.targetLevel / (this.baseline.r || this.targetLevel),
			0.5,
			2.5,
		);
		const gainG = clamp(
			this.targetLevel / (this.baseline.g || this.targetLevel),
			0.5,
			2.5,
		);
		const gainB = clamp(
			this.targetLevel / (this.baseline.b || this.targetLevel),
			0.5,
			2.5,
		);

		return {
			r: r * gainR,
			g: g * gainG,
			b: b * gainB,
		};
	}
}

export class ChromPulseModel {
	private rQueue: number[] = [];
	private gQueue: number[] = [];
	private bQueue: number[] = [];

	constructor(private readonly windowSize = 45) {}

	reset() {
		this.rQueue = [];
		this.gQueue = [];
		this.bQueue = [];
	}

	process(r: number, g: number, b: number): number {
		this.rQueue.push(r);
		this.gQueue.push(g);
		this.bQueue.push(b);

		if (this.rQueue.length > this.windowSize) {
			this.rQueue.shift();
			this.gQueue.shift();
			this.bQueue.shift();
		}

		const len = this.rQueue.length;
		if (len < 10) return 0;

		const meanR = mean(this.rQueue);
		const meanG = mean(this.gQueue);
		const meanB = mean(this.bQueue);
		const rn = r / (meanR || 1);
		const gn = g / (meanG || 1);
		const bn = b / (meanB || 1);
		const xs = 3 * rn - 2 * gn;
		const ys = 1.5 * rn + gn - 1.5 * bn;

		const xValues: number[] = [];
		const yValues: number[] = [];
		for (let i = 0; i < len; i++) {
			const curRn = this.rQueue[i] / (meanR || 1);
			const curGn = this.gQueue[i] / (meanG || 1);
			const curBn = this.bQueue[i] / (meanB || 1);
			xValues.push(3 * curRn - 2 * curGn);
			yValues.push(1.5 * curRn + curGn - 1.5 * curBn);
		}

		const stdX = standardDeviation(xValues);
		const stdY = standardDeviation(yValues);
		const alpha = stdY > 1e-6 ? stdX / stdY : 1;
		return xs - alpha * ys;
	}
}

export function computeSignalSnrDb(values: number[]): number {
	if (values.length < 8) return -100;

	const meanValue = mean(values);
	let signalVar = 0;
	for (let i = 0; i < values.length; i++) {
		const delta = values[i] - meanValue;
		signalVar += delta * delta;
	}
	signalVar /= values.length;

	let noiseVar = 0;
	for (let i = 0; i < values.length - 1; i++) {
		const delta = values[i + 1] - values[i];
		noiseVar += delta * delta;
	}
	noiseVar /= Math.max(1, values.length - 1);

	if (
		!Number.isFinite(signalVar) ||
		!Number.isFinite(noiseVar) ||
		noiseVar <= 1e-9
	) {
		return -100;
	}

	const snr = signalVar / noiseVar;
	if (snr <= 0) return -100;
	return 10 * Math.log10(snr);
}

function mean(values: number[]): number {
	if (!values.length) return 0;
	let total = 0;
	for (let i = 0; i < values.length; i++) {
		total += values[i];
	}
	return total / values.length;
}

function standardDeviation(values: number[]): number {
	if (values.length < 2) return 0;
	const avg = mean(values);
	let total = 0;
	for (let i = 0; i < values.length; i++) {
		const delta = values[i] - avg;
		total += delta * delta;
	}
	return Math.sqrt(total / values.length);
}
