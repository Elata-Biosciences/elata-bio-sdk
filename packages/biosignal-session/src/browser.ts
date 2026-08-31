/**
 * `@elata-biosciences/biosignal-session/browser` — browser recording entry.
 *
 * Re-exports the shared contracts plus everything a recording app needs:
 * the handshake, the recording engine (`RecorderCore`), the worker message
 * contract, the module-worker launcher, and the device adapters
 * (headband / rPPG / PPG — optional peers, type-only imports).
 */

export * from "./index";
export * from "./adapters/types";
export * from "./adapters/headbandSource";
export * from "./adapters/rppgSource";
export * from "./adapters/ppgSource";
export * from "./arrow/schemas";
export * from "./arrow/encode";
export * from "./arrow/decode";
export * from "./protocol/handshake";
export * from "./client/chunkQueue";
export * from "./client/recorderCore";
export * from "./client/recordingWorkerLauncher";
export * from "./worker/sampleBuffer";
export * from "./worker/workerMessages";
