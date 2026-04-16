/**
 * Web Bluetooth headband transport and Muse helpers. Depends on
 * `@elata-biosciences/eeg-web` (peer); re-exports `AthenaWasmDecoder` for Athena
 * decode setup. See `llms.txt` in the package root for integration notes.
 */
export * from "./devices/muse/museDevice";
export * from "./transport/bleTransport";
export * from "./browserCheck";

// Re-exported from eeg-web for convenience — BleTransport requires
// AthenaWasmDecoder but it lives in the peer package.
export { AthenaWasmDecoder } from "@elata-biosciences/eeg-web";
