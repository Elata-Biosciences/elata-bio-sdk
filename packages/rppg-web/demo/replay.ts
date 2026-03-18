import {
	replayBayesSession,
	type ReplayBayesSessionResult,
	type ReplayDebugSession,
} from "../src";

function getEl<T extends HTMLElement = HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`Missing element: #${id}`);
	return el as T;
}

const jsonInput = getEl<HTMLTextAreaElement>("json-input");
const fileInput = getEl<HTMLInputElement>("file-input");
const loadFileBtn = getEl<HTMLButtonElement>("load-file-btn");
const runBtn = getEl<HTMLButtonElement>("run-btn");
const sampleBtn = getEl<HTMLButtonElement>("sample-btn");
const copyBtn = getEl<HTMLButtonElement>("copy-btn");
const statusEl = getEl("status");
const schemaBadge = getEl("schema-badge");
const pointsCountEl = getEl("points-count");
const latestBpmEl = getEl("latest-bpm");
const latestConfidenceEl = getEl("latest-confidence");
const latestMaeEl = getEl("latest-mae");
const pairSummariesEl = getEl<HTMLPreElement>("pair-summaries");
const pointsPreviewEl = getEl<HTMLPreElement>("points-preview");

let currentResult: ReplayBayesSessionResult | null = null;

function setStatus(text: string, tone: "idle" | "good" | "bad" = "idle") {
	statusEl.textContent = text;
	statusEl.className =
		tone === "good"
			? "text-[11px] text-emerald-300"
			: tone === "bad"
				? "text-[11px] text-rose-300"
				: "text-[11px] text-slate-400";
}

function formatJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function isReplayResult(value: unknown): value is ReplayBayesSessionResult {
	if (!value || typeof value !== "object") return false;
	const raw = value as Record<string, unknown>;
	return (
		typeof raw.schema === "string" &&
		Array.isArray(raw.points) &&
		Array.isArray(raw.pairSummaries)
	);
}

function isReplaySession(value: unknown): value is ReplayDebugSession {
	if (!value || typeof value !== "object") return false;
	const raw = value as Record<string, unknown>;
	return Array.isArray(raw.syncSamples);
}

function renderResult(result: ReplayBayesSessionResult) {
	currentResult = result;
	const latestPoint = result.points[result.points.length - 1] ?? null;
	const latestSummary = result.pairSummaries[result.pairSummaries.length - 1] ?? null;

	schemaBadge.textContent = result.schema;
	pointsCountEl.textContent = String(result.points.length);
	latestBpmEl.textContent =
		latestPoint?.replayBayesBpm != null
			? latestPoint.replayBayesBpm.toFixed(2)
			: "--";
	latestConfidenceEl.textContent =
		latestPoint != null ? latestPoint.replayBayesConfidence.toFixed(3) : "--";
	latestMaeEl.textContent =
		latestSummary?.replayBayesMae != null
			? latestSummary.replayBayesMae.toFixed(3)
			: "--";
	pairSummariesEl.textContent = result.pairSummaries.length
		? formatJson(result.pairSummaries)
		: "No pair summaries in this replay.";
	pointsPreviewEl.textContent = result.points.length
		? formatJson(result.points.slice(-8))
		: "No points in this replay.";
}

function loadSample() {
	const sample: ReplayDebugSession = {
		syncSamples: [
			{
				epochTs: 1000,
				sampleRate: 30,
				stage: "tracked",
				filteredWindow: {
					values: new Array(180).fill(0).map((_, i) => {
						const t = i / 30;
						return Math.sin(2 * Math.PI * 1.2 * t) + 0.2 * Math.sin(2 * Math.PI * 2.4 * t);
					}),
				},
				estimators: {
					instantBpm: 72,
					peakConfidence: 0.72,
					acfBpm: 71,
					acfConfidence: 0.8,
					spectralBpm: 72,
					spectralConfidence: 0.91,
					cameraConfidence: 0.88,
					snrDb: 8,
					motion: 0.03,
					bayesBpm: 72,
					bayesConfidence: 0.9,
					finalBpm: 72,
				},
				outputs: {
					signalQuality: 84,
				},
			},
			{
				epochTs: 1600,
				sampleRate: 30,
				stage: "tracked",
				filteredWindow: {
					values: new Array(180).fill(0).map((_, i) => {
						const t = i / 30;
						return Math.sin(2 * Math.PI * 1.2 * t) + 0.2 * Math.sin(2 * Math.PI * 2.4 * t);
					}),
				},
				estimators: {
					instantBpm: 71,
					peakConfidence: 0.68,
					acfBpm: 72,
					acfConfidence: 0.82,
					spectralBpm: 72,
					spectralConfidence: 0.9,
					cameraConfidence: 0.89,
					snrDb: 8.2,
					motion: 0.02,
					bayesBpm: 72,
					bayesConfidence: 0.92,
					finalBpm: 72,
				},
				outputs: {
					signalQuality: 86,
				},
			},
		],
		pairEvents: [{ ts: 900, referenceBpm: 72 }],
	};
	jsonInput.value = formatJson(sample);
	setStatus("Loaded sample replay session.", "idle");
}

function parseAndRender() {
	const text = jsonInput.value.trim();
	if (!text) {
		setStatus("Paste a replay payload first.", "bad");
		return;
	}

	try {
		const parsed = JSON.parse(text);
		if (isReplayResult(parsed)) {
			renderResult(parsed);
			setStatus("Rendered replay result payload.", "good");
			return;
		}
		if (isReplaySession(parsed)) {
			const result = replayBayesSession(parsed);
			renderResult(result);
			setStatus("Rendered raw replay session via replayBayesSession().", "good");
			return;
		}
		setStatus("JSON shape not recognized. Expected ReplayBayesSessionResult or ReplayDebugSession.", "bad");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(`Invalid JSON: ${message}`, "bad");
	}
}

loadFileBtn.addEventListener("click", () => {
	fileInput.click();
});

fileInput.addEventListener("change", async () => {
	const file = fileInput.files?.[0];
	if (!file) return;
	try {
		jsonInput.value = await file.text();
		setStatus(`Loaded file: ${file.name}`, "idle");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(`Failed to read file: ${message}`, "bad");
	}
});

runBtn.addEventListener("click", () => {
	parseAndRender();
});

sampleBtn.addEventListener("click", () => {
	loadSample();
	parseAndRender();
});

copyBtn.addEventListener("click", async () => {
	if (!currentResult) {
		setStatus("Run a replay before copying the result.", "bad");
		return;
	}
	try {
		await navigator.clipboard.writeText(formatJson(currentResult));
		setStatus("Copied replay result JSON.", "good");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(`Clipboard copy failed: ${message}`, "bad");
	}
});

loadSample();
parseAndRender();
