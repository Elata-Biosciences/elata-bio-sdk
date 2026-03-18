import type {
	RppgSessionDiagnostics,
	RppgSessionError,
	RppgSessionStatePhase,
} from "./rppgSession";

export type RppgNormalizedErrorCode =
	| "wasm_init_failed"
	| "face_tracking_init_failed"
	| "camera_not_playing"
	| "capture_failed"
	| "canvas_unavailable"
	| "processor_failed"
	| "backend_unavailable"
	| "startup_failed"
	| "runtime_failed";

export type RppgNormalizedError = {
	code: RppgNormalizedErrorCode;
	phase: "startup" | "runtime";
	message: string;
	detail: string;
	guidance: string;
	retryable: boolean;
	terminal: boolean;
};

type DiagnosticsLike = Partial<
	Pick<RppgSessionDiagnostics, "backendMode" | "state" | "lastError">
>;

export function normalizeRppgError(
	error?: unknown,
	diagnostics?: DiagnosticsLike | null,
): RppgNormalizedError | null {
	const sessionError = coerceSessionError(error ?? diagnostics?.lastError);
	const backendUnavailable =
		!sessionError && diagnostics?.backendMode === "unavailable";
	if (!sessionError && !backendUnavailable) return null;

	if (backendUnavailable) {
		return {
			code: "backend_unavailable",
			phase: phaseFromDiagnostics(diagnostics?.state?.phase),
			message: "rPPG is running without the WASM processor backend.",
			detail:
				"Packaged WASM assets were unavailable, so the session cannot provide full estimation.",
			guidance:
				"Serve the packaged WASM assets or pass wasmJsUrl, wasmBinaryUrl, or wasmImporter explicitly.",
			retryable: false,
			terminal: false,
		};
	}

	const detail = formatErrorDetail(sessionError);
	const lower = detail.toLowerCase();
	const phase =
		sessionError && sessionError.code === "processor_error"
			? "runtime"
			: phaseFromDiagnostics(
					diagnostics?.state?.phase ??
						(sessionError?.code === "capture_error" ? "runtime" : "startup"),
				);

	if (
		sessionError?.code === "processor_error" ||
		lower.includes("unreachable")
	) {
		return {
			code: "processor_failed",
			phase: "runtime",
			message: "The rPPG processor stopped unexpectedly.",
			detail,
			guidance:
				"Dispose the failed session and recreate it. Use createManagedRppgSession() if you want automatic retries.",
			retryable: true,
			terminal: true,
		};
	}

	if (
		lower.includes("2d context unavailable") ||
		lower.includes("canvas context")
	) {
		return {
			code: "canvas_unavailable",
			phase,
			message: "This browser could not create the canvas context needed for rPPG sampling.",
			detail,
			guidance:
				"Confirm the browser supports 2D canvas capture for the current video surface, then retry.",
			retryable: false,
			terminal: false,
		};
	}

	if (sessionError?.code === "backend_init_failed" || lower.includes("wasm")) {
		return {
			code: "wasm_init_failed",
			phase: "startup",
			message: "The rPPG WASM backend failed to initialize.",
			detail,
			guidance:
				"Serve the packaged WASM assets or pass wasmJsUrl, wasmBinaryUrl, or wasmImporter explicitly.",
			retryable: false,
			terminal: false,
		};
	}

	if (sessionError?.code === "face_mesh_init_failed") {
		return {
			code: "face_tracking_init_failed",
			phase: "startup",
			message: "Face tracking failed to initialize.",
			detail,
			guidance:
				"Use faceMesh: 'off' for center-box mode, or ensure FaceMesh assets load successfully.",
			retryable: false,
			terminal: false,
		};
	}

	if (sessionError?.code === "capture_error") {
		if (
			lower.includes("never started playing") ||
			lower.includes("video did not start playing")
		) {
			return {
				code: "camera_not_playing",
				phase: "runtime",
				message: "The camera stream opened, but the video element never started playing.",
				detail,
				guidance:
					"Confirm the video element is attached to the stream, autoplay is allowed, and playback has started before creating the session.",
				retryable: true,
				terminal: false,
			};
		}
		return {
			code: "capture_failed",
			phase: "runtime",
			message: "rPPG frame capture failed.",
			detail,
			guidance:
				"Check camera permissions, video playback state, and browser capture support before retrying.",
			retryable: true,
			terminal: false,
		};
	}

	return {
		code: phase === "runtime" ? "runtime_failed" : "startup_failed",
		phase,
		message:
			phase === "runtime"
				? "rPPG stopped unexpectedly."
				: "rPPG failed to start.",
		detail,
		guidance:
			phase === "runtime"
				? "Inspect the normalized error detail and diagnostics, then recreate the session if the failure is terminal."
				: "Inspect the normalized error detail, verify browser support and asset wiring, then retry startup.",
		retryable: phase === "runtime",
		terminal: phase === "runtime",
	};
}

function formatErrorDetail(error: RppgSessionError | null): string {
	if (!error) return "Unknown rPPG error.";
	const message = error.message || "Unknown rPPG error.";
	const causeMessage = formatCause(error.cause);
	return causeMessage && causeMessage !== message
		? `${message} ${causeMessage}`
		: message;
}

function formatCause(cause: unknown): string {
	if (!cause) return "";
	if (typeof cause === "string") return cause;
	if (cause instanceof Error) return cause.message;
	return String(cause);
}

function phaseFromDiagnostics(
	phase: RppgSessionStatePhase | "startup" | "runtime" | null | undefined,
): "startup" | "runtime" {
	return phase === "runtime" ? "runtime" : "startup";
}

function coerceSessionError(value: unknown): RppgSessionError | null {
	if (!value || typeof value !== "object") return null;
	if (!("code" in value) || !("stage" in value) || !("message" in value)) {
		return null;
	}
	return value as RppgSessionError;
}
