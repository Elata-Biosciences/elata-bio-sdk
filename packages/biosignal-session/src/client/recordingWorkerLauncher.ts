/**
 * Launch the recording worker as a module worker from the built package.
 *
 * The `new Worker(new URL(..., import.meta.url), { type: "module" })`
 * pattern is statically analyzable by Vite/Webpack/Next so bundlers include
 * the worker file in their asset graph. Not importable under Jest's CJS
 * transform (`import.meta`) — tests drive `RecorderCore` directly instead.
 */

import { BiosignalClientError } from "../protocol/errors";

export interface LaunchRecordingWorkerOptions {
	/** Override the worker script URL (defaults to the built worker). */
	workerUrl?: string | URL;
	/** Full override for exotic hosts; wins over `workerUrl`. */
	workerFactory?: () => Worker;
}

export function launchRecordingWorker(
	options: LaunchRecordingWorkerOptions = {},
): Worker {
	if (options.workerFactory) return options.workerFactory();
	if (typeof Worker === "undefined") {
		throw new BiosignalClientError(
			"not_supported",
			"Web Workers are not available in this environment",
		);
	}
	const url =
		options.workerUrl ??
		new URL("../worker/recordingWorker.js", import.meta.url);
	return new Worker(url, { type: "module" });
}
