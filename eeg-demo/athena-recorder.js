import { AthenaWasmDecoder, initEegWasm } from "@elata-biosciences/eeg-web";
import { BleTransport } from "@elata-biosciences/eeg-web-ble";

const elements = {
	subjectId: document.querySelector("#subject-id"),
	sessionId: document.querySelector("#session-id"),
	protocol: document.querySelector("#protocol"),
	taskLabel: document.querySelector("#task-label"),
	ageBand: document.querySelector("#age-band"),
	artifactBurden: document.querySelector("#artifact-burden"),
	recentCaffeine: document.querySelector("#recent-caffeine"),
	recentExercise: document.querySelector("#recent-exercise"),
	recentNicotine: document.querySelector("#recent-nicotine"),
	operatorNotes: document.querySelector("#operator-notes"),
	connect: document.querySelector("#connect"),
	start: document.querySelector("#start"),
	stop: document.querySelector("#stop"),
	export: document.querySelector("#export"),
	disconnect: document.querySelector("#disconnect"),
	reset: document.querySelector("#reset"),
	status: document.querySelector("#status"),
	deviceInfo: document.querySelector("#device-info"),
	exportPreview: document.querySelector("#export-preview"),
	eegCount: document.querySelector("#eeg-count"),
	opticsCount: document.querySelector("#optics-count"),
	imuCount: document.querySelector("#imu-count"),
	batteryCount: document.querySelector("#battery-count"),
	ppgCount: document.querySelector("#ppg-count"),
	fallbackCount: document.querySelector("#fallback-count"),
};

const state = {
	transport: null,
	connected: false,
	streaming: false,
	wasmReady: false,
	boardInfo: null,
	startedAtIso: null,
	startedAtMs: null,
	stoppedAtMs: null,
	sharedZeroTimestampMs: null,
	fallbackRowCount: 0,
	lastSyntheticTimestampMs: {
		eeg: null,
		fnirs: null,
		imu: null,
		ppg: null,
		battery: null,
	},
	channelNames: {
		eeg: [],
		fnirs: [],
		imu: [],
		ppg: [],
		battery: ["battery_percent"],
	},
	sampleRates: {
		eeg: null,
		fnirs: null,
		imu: null,
		ppg: null,
		battery: null,
	},
	rows: {
		eeg: [],
		fnirs: [],
		imu: [],
		ppg: [],
		battery: [],
	},
};

function pad(value) {
	return String(value).padStart(2, "0");
}

function defaultSessionId() {
	const now = new Date();
	return `ses-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function sanitizeFileStem(value) {
	return value.trim().replace(/[^A-Za-z0-9._-]+/g, "_");
}

function normalizeHeader(name) {
	return String(name || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function formatSeconds(value) {
	return Number.isFinite(value) ? value.toFixed(6) : "";
}

function setStatus(message) {
	elements.status.textContent = message;
}

function updateButtons() {
	elements.connect.disabled = state.connected || !state.wasmReady;
	elements.start.disabled = !state.connected || state.streaming;
	elements.stop.disabled = !state.streaming;
	elements.disconnect.disabled = !state.connected;
	elements.export.disabled =
		state.streaming ||
		(!state.rows.eeg.length && !state.rows.fnirs.length && !state.rows.imu.length);
}

function updateMetrics() {
	elements.eegCount.textContent = String(state.rows.eeg.length);
	elements.opticsCount.textContent = String(state.rows.fnirs.length);
	elements.imuCount.textContent = String(state.rows.imu.length);
	elements.batteryCount.textContent = String(state.rows.battery.length);
	elements.ppgCount.textContent = String(state.rows.ppg.length);
	elements.fallbackCount.textContent = String(state.fallbackRowCount);
}

function updateDeviceInfo() {
	if (!state.boardInfo) {
		elements.deviceInfo.textContent = "Not connected.";
		return;
	}
	elements.deviceInfo.textContent = JSON.stringify(state.boardInfo, null, 2);
}

function currentDurationSeconds() {
	if (!state.startedAtMs) return 0;
	const end = state.streaming ? Date.now() : state.stoppedAtMs || Date.now();
	return Math.max(0, (end - state.startedAtMs) / 1000);
}

function resetCaptureBuffers() {
	state.startedAtIso = null;
	state.startedAtMs = null;
	state.stoppedAtMs = null;
	state.sharedZeroTimestampMs = null;
	state.fallbackRowCount = 0;
	state.lastSyntheticTimestampMs = {
		eeg: null,
		fnirs: null,
		imu: null,
		ppg: null,
		battery: null,
	};
	state.rows = {
		eeg: [],
		fnirs: [],
		imu: [],
		ppg: [],
		battery: [],
	};
	updateMetrics();
	updateExportPreview();
}

function useSharedZeroTimestamp(timestampMs) {
	if (state.sharedZeroTimestampMs === null && Number.isFinite(timestampMs)) {
		state.sharedZeroTimestampMs = timestampMs;
	}
	return state.sharedZeroTimestampMs ?? timestampMs;
}

function fallbackTimestamps(modalityName, sampleCount, sampleRateHz, emittedAtMs) {
	const emittedWallClockMs = performance.timeOrigin + emittedAtMs;
	const stepMs =
		Number.isFinite(sampleRateHz) && sampleRateHz > 0 ? 1000 / sampleRateHz : 1000;
	const firstTimestampMs =
		state.lastSyntheticTimestampMs[modalityName] === null
			? emittedWallClockMs
			: state.lastSyntheticTimestampMs[modalityName] + stepMs;
	const timestampsMs = [];
	for (let index = 0; index < sampleCount; index += 1) {
		timestampsMs.push(firstTimestampMs + index * stepMs);
	}
	state.lastSyntheticTimestampMs[modalityName] =
		timestampsMs[timestampsMs.length - 1] ?? state.lastSyntheticTimestampMs[modalityName];
	state.fallbackRowCount += sampleCount;
	return timestampsMs;
}

function resolveTimestampsMs(modalityName, explicitTimestampsMs, sampleCount, sampleRateHz, emittedAtMs) {
	if (Array.isArray(explicitTimestampsMs) && explicitTimestampsMs.length === sampleCount) {
		return explicitTimestampsMs.slice();
	}
	return fallbackTimestamps(modalityName, sampleCount, sampleRateHz, emittedAtMs);
}

function appendSignalBlock(modalityName, block, emittedAtMs) {
	if (!block || !Array.isArray(block.samples) || block.samples.length === 0) return;
	state.sampleRates[modalityName] = block.sampleRateHz ?? state.sampleRates[modalityName];
	if (Array.isArray(block.channelNames) && block.channelNames.length > 0) {
		state.channelNames[modalityName] = block.channelNames.slice();
	}
	const timestampsMs = resolveTimestampsMs(
		modalityName,
		block.timestampsMs,
		block.samples.length,
		block.sampleRateHz,
		emittedAtMs,
	);
	for (let index = 0; index < block.samples.length; index += 1) {
		const sharedZeroMs = useSharedZeroTimestamp(timestampsMs[index]);
		const timestampSeconds = (timestampsMs[index] - sharedZeroMs) / 1000;
		state.rows[modalityName].push([timestampSeconds, ...block.samples[index]]);
	}
}

function appendBatteryBlock(block, emittedAtMs) {
	if (!block || !Array.isArray(block.samples) || block.samples.length === 0) return;
	const timestampsMs = resolveTimestampsMs(
		"battery",
		block.timestampsMs,
		block.samples.length,
		state.sampleRates.battery,
		emittedAtMs,
	);
	for (let index = 0; index < block.samples.length; index += 1) {
		const sharedZeroMs = useSharedZeroTimestamp(timestampsMs[index]);
		const timestampSeconds = (timestampsMs[index] - sharedZeroMs) / 1000;
		state.rows.battery.push([timestampSeconds, block.samples[index]]);
	}
}

function updateExportPreview() {
	const preview = {
		start_time_utc: state.startedAtIso,
		duration_seconds: Number(currentDurationSeconds().toFixed(3)),
		timestamp_source: inferredTimestampSource(),
		modalities: {
			eeg_rows: state.rows.eeg.length,
			optics_rows: state.rows.fnirs.length,
			imu_rows: state.rows.imu.length,
			battery_rows: state.rows.battery.length,
			ppg_rows: state.rows.ppg.length,
		},
		local_timestamp_fallback_rows: state.fallbackRowCount,
	};
	elements.exportPreview.textContent = JSON.stringify(preview, null, 2);
}

function inferredTimestampSource() {
	if (state.sharedZeroTimestampMs === null) return "no_samples_recorded";
	if (state.fallbackRowCount === 0) return "athena_device_timestamps";
	if (state.fallbackRowCount > 0) return "athena_device_timestamps_with_local_fallback";
	return "local_wall_clock_fallback";
}

function buildShiftMetadata() {
	const shiftMetadata = {
		artifact_burden: elements.artifactBurden.value || "unknown",
	};
	if (elements.ageBand.value) shiftMetadata.age_band = elements.ageBand.value;
	if (elements.recentCaffeine.checked) shiftMetadata.recent_caffeine = true;
	if (elements.recentExercise.checked) shiftMetadata.recent_exercise = true;
	if (elements.recentNicotine.checked) shiftMetadata.recent_nicotine = true;
	return shiftMetadata;
}

function buildModalityBlock({
	present,
	relativePath,
	sampleRateHz,
	channelNames,
	geometryAvailable,
	featureDim,
	extra = {},
}) {
	return {
		present,
		feature_dim: featureDim,
		sampling_rate_hz: sampleRateHz,
		geometry_available: geometryAvailable,
		...(channelNames && channelNames.length > 0 ? { channel_names: channelNames } : {}),
		...(present ? { relative_path: relativePath } : {}),
		...extra,
	};
}

function buildSessionSidecar() {
	const subjectId = sanitizeFileStem(elements.subjectId.value || "athena-sub-001");
	const sessionId = sanitizeFileStem(elements.sessionId.value || defaultSessionId());
	const fnirsChannelNames = state.channelNames.fnirs.length
		? state.channelNames.fnirs
		: [];
	const ppgPresent = state.rows.ppg.length > 0;
	const batteryPresent = state.rows.battery.length > 0;
	return {
		subject_id: subjectId,
		session_id: sessionId,
		protocol: elements.protocol.value.trim() || "rest_eyes_open",
		task_label: elements.taskLabel.value.trim() || "rest",
		start_time_utc: state.startedAtIso,
		duration_seconds: Number(currentDurationSeconds().toFixed(3)),
		timestamp_source: inferredTimestampSource(),
		labels: {
			task_labels_present: true,
			event_labels_present: false,
			ppg_morphology_targets_present: false,
		},
		shift_metadata: buildShiftMetadata(),
		...(elements.operatorNotes.value.trim()
			? { operator_notes: elements.operatorNotes.value.trim() }
			: {}),
		quality_fields: [],
		artifact_fields: [],
		modalities: {
			eeg: buildModalityBlock({
				present: state.rows.eeg.length > 0,
				relativePath: "eeg.csv",
				sampleRateHz: state.sampleRates.eeg,
				channelNames: state.channelNames.eeg,
				geometryAvailable: true,
				featureDim: state.channelNames.eeg.length,
				extra: {
					verification_status: "confirmed_from_live_sdk_capture",
				},
			}),
			fnirs: buildModalityBlock({
				present: state.rows.fnirs.length > 0,
				relativePath: "fnirs_optics.csv",
				sampleRateHz: state.sampleRates.fnirs,
				channelNames: fnirsChannelNames,
				geometryAvailable: true,
				featureDim: fnirsChannelNames.length,
				extra: {
					transport_signal: "optics",
					processing_status: "pending_internal_pipeline",
					verification_status: "transport_confirmed_live_sdk_fnirs_mapping_pending",
				},
			}),
			ppg: buildModalityBlock({
				present: ppgPresent,
				relativePath: "ppg.csv",
				sampleRateHz: state.sampleRates.ppg,
				channelNames: state.channelNames.ppg,
				geometryAvailable: false,
				featureDim: state.channelNames.ppg.length,
				extra: {
					mapping_status: ppgPresent
						? "captured_from_live_sdk_path"
						: "not_exposed_by_current_athena_sdk",
					verification_status: ppgPresent
						? "confirmed_from_live_sdk_capture"
						: "pending_device_verification",
				},
			}),
			imu: buildModalityBlock({
				present: state.rows.imu.length > 0,
				relativePath: "imu.csv",
				sampleRateHz: state.sampleRates.imu,
				channelNames: state.channelNames.imu,
				geometryAvailable: false,
				featureDim: state.channelNames.imu.length,
				extra: {
					verification_status: "confirmed_from_live_sdk_capture",
				},
			}),
			...(batteryPresent
				? {
						battery: buildModalityBlock({
							present: true,
							relativePath: "battery.csv",
							sampleRateHz: null,
							channelNames: state.channelNames.battery,
							geometryAvailable: false,
							featureDim: 1,
							extra: {
								verification_status: "confirmed_from_live_sdk_capture",
							},
						}),
					}
				: {}),
		},
	};
}

function csvForRows(headers, rows) {
	const lines = [headers.join(",")];
	for (const row of rows) {
		lines.push(
			row
				.map((value, index) => {
					if (index === 0) return formatSeconds(value);
					return Number.isFinite(value) ? String(value) : "";
				})
				.join(","),
		);
	}
	return `${lines.join("\n")}\n`;
}

function buildExportFiles() {
	const sidecar = buildSessionSidecar();
	const files = [
		{
			name: "athena_session.json",
			content: `${JSON.stringify(sidecar, null, 2)}\n`,
		},
	];
	if (state.rows.eeg.length > 0) {
		files.push({
			name: "eeg.csv",
			content: csvForRows(
				["timestamp", ...state.channelNames.eeg.map(normalizeHeader)],
				state.rows.eeg,
			),
		});
	}
	if (state.rows.fnirs.length > 0) {
		files.push({
			name: "fnirs_optics.csv",
			content: csvForRows(
				["timestamp", ...state.channelNames.fnirs.map(normalizeHeader)],
				state.rows.fnirs,
			),
		});
	}
	if (state.rows.imu.length > 0) {
		files.push({
			name: "imu.csv",
			content: csvForRows(
				["timestamp", ...state.channelNames.imu.map(normalizeHeader)],
				state.rows.imu,
			),
		});
	}
	if (state.rows.battery.length > 0) {
		files.push({
			name: "battery.csv",
			content: csvForRows(["timestamp", "battery_percent"], state.rows.battery),
		});
	}
	if (state.rows.ppg.length > 0) {
		files.push({
			name: "ppg.csv",
			content: csvForRows(
				["timestamp", ...state.channelNames.ppg.map(normalizeHeader)],
				state.rows.ppg,
			),
		});
	}
	return { sidecar, files };
}

async function writeDirectoryExport(files, sidecar) {
	const rootHandle = await window.showDirectoryPicker({ mode: "readwrite" });
	const subjectHandle = await rootHandle.getDirectoryHandle(sidecar.subject_id, {
		create: true,
	});
	const sessionHandle = await subjectHandle.getDirectoryHandle(sidecar.session_id, {
		create: true,
	});

	for (const file of files) {
		const fileHandle = await sessionHandle.getFileHandle(file.name, { create: true });
		const writable = await fileHandle.createWritable();
		await writable.write(file.content);
		await writable.close();
	}
}

function triggerDownload(filename, content) {
	const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 500);
}

function fallbackDownloadExport(files, sidecar) {
	const prefix = `${sidecar.subject_id}__${sidecar.session_id}__`;
	for (const file of files) {
		triggerDownload(`${prefix}${file.name}`, file.content);
	}
}

async function connectAthena() {
	setStatus("Initializing Athena WASM support...");
	if (!state.wasmReady) {
		await initEegWasm();
		state.wasmReady = true;
	}

	const transport = new BleTransport({
		sourceName: "athena-recorder",
		deviceOptions: {
			athenaDecoderFactory: () => new AthenaWasmDecoder(),
		},
	});
	transport.onStatus = (status) => {
		if (status.state === "disconnected") {
			state.connected = false;
			state.streaming = false;
		}
		setStatus(
			status.reason ? `${status.state}: ${status.reason}` : `Transport state: ${status.state}`,
		);
		updateButtons();
	};
	transport.onFrame = (frame) => {
		appendSignalBlock("eeg", frame.eeg, frame.emittedAtMs);
		appendSignalBlock("fnirs", frame.optics, frame.emittedAtMs);
		appendSignalBlock("imu", frame.accgyro, frame.emittedAtMs);
		appendSignalBlock("ppg", frame.ppgRaw, frame.emittedAtMs);
		appendBatteryBlock(frame.battery, frame.emittedAtMs);
		updateMetrics();
		updateExportPreview();
	};

	await transport.connect();
	if (!transport.getIsAthena()) {
		await transport.disconnect();
		throw new Error("Connected device is not reporting the Athena BLE profile.");
	}

	state.transport = transport;
	state.connected = true;
	state.boardInfo = transport.getBoardInfo();
	state.channelNames.eeg = transport.getEegNames();
	state.sampleRates.eeg = state.boardInfo?.sample_rate_hz ?? 256;
	setStatus(`Connected to ${state.boardInfo?.device_name || "Athena"}.`);
	updateDeviceInfo();
	updateButtons();
}

async function startRecording() {
	if (!state.transport) throw new Error("Connect Athena before starting a capture.");
	resetCaptureBuffers();
	state.startedAtMs = Date.now();
	state.startedAtIso = new Date(state.startedAtMs).toISOString();
	state.streaming = true;
	await state.transport.start();
	setStatus("Streaming Athena EEG + optics + IMU...");
	updateButtons();
	updateExportPreview();
}

async function stopRecording() {
	if (!state.transport || !state.streaming) return;
	await state.transport.stop();
	state.streaming = false;
	state.stoppedAtMs = Date.now();
	setStatus("Capture stopped. Export when ready.");
	updateButtons();
	updateExportPreview();
}

async function disconnectAthena() {
	if (!state.transport) return;
	if (state.streaming) {
		await stopRecording();
	}
	await state.transport.disconnect();
	state.transport = null;
	state.connected = false;
	state.boardInfo = null;
	updateDeviceInfo();
	setStatus("Disconnected.");
	updateButtons();
}

async function exportCapture() {
	const { sidecar, files } = buildExportFiles();
	if (!files.some((file) => file.name !== "athena_session.json")) {
		throw new Error("No capture rows are available to export yet.");
	}
	if (typeof window.showDirectoryPicker === "function") {
		await writeDirectoryExport(files, sidecar);
		setStatus(`Exported ${sidecar.subject_id}/${sidecar.session_id} to the selected directory.`);
		return;
	}
	fallbackDownloadExport(files, sidecar);
	setStatus("Downloaded session files individually because the File System Access API is unavailable.");
}

async function safeRun(task, message) {
	try {
		await task();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		setStatus(`${message}: ${reason}`);
	} finally {
		updateButtons();
	}
}

elements.connect.addEventListener("click", () => {
	void safeRun(connectAthena, "Athena connection failed");
});

elements.start.addEventListener("click", () => {
	void safeRun(startRecording, "Recording start failed");
});

elements.stop.addEventListener("click", () => {
	void safeRun(stopRecording, "Recording stop failed");
});

elements.disconnect.addEventListener("click", () => {
	void safeRun(disconnectAthena, "Disconnect failed");
});

elements.export.addEventListener("click", () => {
	void safeRun(exportCapture, "Export failed");
});

elements.reset.addEventListener("click", () => {
	resetCaptureBuffers();
	setStatus(
		state.connected
			? "Capture buffers cleared. Ready for the next take."
			: "Capture buffers cleared.",
	);
	updateButtons();
});

elements.sessionId.value = defaultSessionId();
updateMetrics();
updateDeviceInfo();
updateExportPreview();

try {
	await initEegWasm();
	state.wasmReady = true;
	setStatus("Athena WASM loaded. Connect when ready.");
} catch (error) {
	const reason = error instanceof Error ? error.message : String(error);
	setStatus(`Failed to load Athena WASM: ${reason}`);
}
updateButtons();
