import { initPpgDemo } from "../src/demoApp";

function getEl<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) throw new Error(`Missing #${id}`);
	return element as T;
}

const connectBtn = getEl<HTMLButtonElement>("connect-btn");
const statusEl = getEl<HTMLDivElement>("status");
const bpmEl = getEl<HTMLDivElement>("bpm");
const confidenceEl = getEl<HTMLDivElement>("confidence");
const rmssdEl = getEl<HTMLDivElement>("rmssd");
const sdnnEl = getEl<HTMLDivElement>("sdnn");
const qualityEl = getEl<HTMLDivElement>("quality");
const channelEl = getEl<HTMLDivElement>("channel");
const sourceEl = getEl<HTMLSpanElement>("source");
const sampleRateEl = getEl<HTMLSpanElement>("sample-rate");
const reasonsEl = getEl<HTMLSpanElement>("reasons");
const transportEl = getEl<HTMLSpanElement>("transport");
const windowEl = getEl<HTMLSpanElement>("window");
const framesEl = getEl<HTMLSpanElement>("frames");
const waveform = getEl<HTMLCanvasElement>("waveform");

let activeSession:
	| Awaited<ReturnType<typeof initPpgDemo>>["session"]
	| null = null;
type DemoWindow = Window & { __ppgAthenaInitError?: string };

function fmt(value: number | null, digits = 0, suffix = ""): string {
	return value == null || !Number.isFinite(value)
		? "--"
		: `${value.toFixed(digits)}${suffix}`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function smoothDisplayValues(
	values: number[],
	windowSize: number,
): number[] {
	if (values.length <= 2) return values.slice();
	const normalizedWindowSize = windowSize % 2 === 0 ? windowSize + 1 : windowSize;
	const radius = Math.floor(normalizedWindowSize / 2);
	const smoothed: number[] = [];

	for (let index = 0; index < values.length; index++) {
		let sum = 0;
		let count = 0;
		for (
			let neighborIndex = Math.max(0, index - radius);
			neighborIndex <= Math.min(values.length - 1, index + radius);
			neighborIndex++
		) {
			sum += values[neighborIndex];
			count += 1;
		}
		smoothed.push(count > 0 ? sum / count : values[index]);
	}

	return smoothed;
}

function percentile(sortedValues: number[], p: number): number {
	if (!sortedValues.length) return 0;
	const clamped = clamp(p, 0, 1);
	const idx = Math.min(
		sortedValues.length - 1,
		Math.max(0, Math.round((sortedValues.length - 1) * clamped)),
	);
	return sortedValues[idx];
}

function prepareDisplayValues(
	rawValues: number[],
	sampleRateHz: number | null,
): number[] {
	if (rawValues.length <= 2) return rawValues.map(() => 0);
	const sampleRate = sampleRateHz && sampleRateHz > 0 ? sampleRateHz : 64;
	const visibleSmoothingWindow = Math.max(
		3,
		Math.round((sampleRate * 120) / 1000),
	);
	const baselineWindow = Math.max(
		visibleSmoothingWindow + 4,
		Math.round((sampleRate * 900) / 1000),
	);

	const baseline = smoothDisplayValues(rawValues, baselineWindow);
	const detrended = rawValues.map((value, index) => value - (baseline[index] ?? 0));
	const smoothed = smoothDisplayValues(detrended, visibleSmoothingWindow);

	const magnitudes = smoothed
		.map((value) => Math.abs(value))
		.filter((value) => Number.isFinite(value))
		.sort((a, b) => a - b);
	const scale = Math.max(percentile(magnitudes, 0.9), 1e-3);

	return smoothed.map((value) => clamp(value / scale, -2.2, 2.2));
}

function drawWaveform() {
	const session = activeSession;
	const ctx = waveform.getContext("2d");
	if (!session || !ctx) {
		requestAnimationFrame(drawWaveform);
		return;
	}

	const trace = session.getTraceSnapshot(320);
	const sampleRate = trace.sampleRateHz && trace.sampleRateHz > 0 ? trace.sampleRateHz : 64;
	const visiblePointCount = Math.max(
		48,
		Math.min(trace.points.length, Math.round(sampleRate * 6)),
	);
	const visiblePoints = trace.points.slice(-visiblePointCount);
	ctx.clearRect(0, 0, waveform.width, waveform.height);
	ctx.strokeStyle = "rgba(138, 177, 191, 0.3)";
	ctx.beginPath();
	ctx.moveTo(0, waveform.height / 2);
	ctx.lineTo(waveform.width, waveform.height / 2);
	ctx.stroke();

	if (visiblePoints.length > 1) {
		const visualMin = -2.2;
		const visualMax = 2.2;
		const visualRange = visualMax - visualMin;
		const displayValues = prepareDisplayValues(
			visiblePoints.map((point) => point.value),
			trace.sampleRateHz,
		);
		ctx.strokeStyle = "#5eead4";
		ctx.lineWidth = 2;
		ctx.beginPath();
		visiblePoints.forEach((point, index) => {
			const x = (index / (visiblePoints.length - 1)) * waveform.width;
			const normalizedValue = clamp(displayValues[index] ?? 0, visualMin, visualMax);
			const y =
				waveform.height * 0.1 +
				((visualMax - normalizedValue) / visualRange) * waveform.height * 0.8;
			if (index === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.stroke();
	}

	requestAnimationFrame(drawWaveform);
}

function startPolling() {
	setInterval(() => {
		if (!activeSession) return;
		const diagnostics = activeSession.getDiagnostics();
		const metrics = diagnostics.metrics;
		const debug = activeSession.getDebugSnapshot();
		bpmEl.textContent = fmt(metrics.bpm, 0);
		confidenceEl.textContent = `Confidence ${fmt(metrics.confidence * 100, 0, "%")}`;
		rmssdEl.textContent = fmt(metrics.rmssdMs, 0, " ms");
		sdnnEl.textContent = `SDNN ${fmt(metrics.sdnnMs, 0, " ms")}`;
		qualityEl.textContent = fmt(metrics.signalQuality * 100, 0, "%");
		channelEl.textContent = `Channel ${metrics.channel ?? "--"}`;
		sourceEl.textContent = metrics.source ?? "--";
		sampleRateEl.textContent = fmt(metrics.sampleRateHz, 0, " Hz");
		reasonsEl.textContent =
			metrics.reasonCodes.length > 0 ? metrics.reasonCodes.join(", ") : "--";
		transportEl.textContent = diagnostics.transportStatus?.state ?? "--";
		windowEl.textContent = `${metrics.windowSampleCount} samples / ${fmt(
			metrics.windowDurationMs,
			0,
			" ms",
		)}`;
		framesEl.textContent = String(debug.framesSeen);
	}, 400);
}

connectBtn.addEventListener("click", async () => {
	if (activeSession) {
		window.location.reload();
		return;
	}

	statusEl.textContent = "Connecting...";
	connectBtn.disabled = true;

	try {
		const { session } = await initPpgDemo({
			onStatus: (status) => {
				statusEl.textContent = `${status.state}${status.reason ? `: ${status.reason}` : ""}`;
			},
		});
		activeSession = session;
		connectBtn.textContent = "Reload Demo";
		statusEl.textContent = "Streaming";
		connectBtn.disabled = false;
	} catch (error) {
		const athenaInitError = (window as DemoWindow).__ppgAthenaInitError;
		statusEl.textContent =
			athenaInitError && error instanceof Error
				? `${error.message} (Athena decoder unavailable: ${athenaInitError})`
				: error instanceof Error
					? error.message
					: "Failed to start PPG demo";
		connectBtn.disabled = false;
	}
});

startPolling();
drawWaveform();
