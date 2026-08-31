/**
 * Launch the analytics worker as a module worker from the built package.
 *
 * The `new Worker(new URL(..., import.meta.url), { type: "module" })` pattern
 * is statically analyzable by Vite/Webpack/Next, so bundlers pull the worker
 * file into their asset graph. This module is deliberately NOT imported by
 * `client.ts`: `import.meta` cannot be parsed under Jest's CJS transform, and
 * tests drive the client through an injected `port`/`createWorker` instead.
 *
 * Consumers that want the default worker wire it up explicitly:
 *
 * ```ts
 * import { createAnalyticsWorkerClient, launchAnalyticsWorker } from
 *   "@elata-biosciences/biosignal-analytics";
 *
 * const client = createAnalyticsWorkerClient({ createWorker: launchAnalyticsWorker });
 * ```
 */

import { AnalyticsError } from "../errors.js";

export interface LaunchAnalyticsWorkerOptions {
	/** Override the worker script URL (defaults to the built worker). */
	workerUrl?: string | URL;
}

export function launchAnalyticsWorker(
	options: LaunchAnalyticsWorkerOptions = {},
): Worker {
	if (typeof Worker === "undefined") {
		throw new AnalyticsError(
			"unsupported",
			"Web Workers are not available in this environment",
		);
	}
	const url =
		options.workerUrl ?? new URL("./analyticsWorker.js", import.meta.url);
	return new Worker(url, { type: "module" });
}
