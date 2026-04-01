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
const waveform = getEl<HTMLCanvasElement>("waveform");

let activeSession:
	| Awaited<ReturnType<typeof initPpgDemo>>["session"]
	| null = null;

function fmt(value: number | null, digits = 0, suffix = ""): string {
	return value == null || !Number.isFinite(value)
		? "--"
		: `${value.toFixed(digits)}${suffix}`;
}

function drawWaveform() {
	const session = activeSession;
	const ctx = waveform.getContext("2d");
	if (!session || !ctx) {
		requestAnimationFrame(drawWaveform);
		return;
	}

	const trace = session.getTraceSnapshot(320);
	ctx.clearRect(0, 0, waveform.width, waveform.height);
	ctx.strokeStyle = "rgba(138, 177, 191, 0.3)";
	ctx.beginPath();
	ctx.moveTo(0, waveform.height / 2);
	ctx.lineTo(waveform.width, waveform.height / 2);
	ctx.stroke();

	if (trace.points.length > 1) {
		const values = trace.points.map((point) => point.value);
		const min = Math.min(...values);
		const max = Math.max(...values);
		const range = Math.max(1, max - min);
		ctx.strokeStyle = "#5eead4";
		ctx.lineWidth = 2;
		ctx.beginPath();
		trace.points.forEach((point, index) => {
			const x = (index / (trace.points.length - 1)) * waveform.width;
			const y =
				waveform.height -
				((point.value - min) / range) * waveform.height * 0.8 -
				waveform.height * 0.1;
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
		statusEl.textContent =
			error instanceof Error ? error.message : "Failed to start PPG demo";
		connectBtn.disabled = false;
	}
});

startPolling();
drawWaveform();
