/**
 * `@elata-biosciences/biosignal-session` — shared contracts and wire
 * protocol for local-first biosignal session recording.
 *
 * This root entry is DOM-free: contracts, protocol types, error codes,
 * time helpers, and the chunk checksum. Browser recording lives in
 * `./browser`; synthetic sources and test fakes live in `./testing`.
 */

export * from "./contracts/ids";
export * from "./contracts/modality";
export * from "./contracts/provenance";
export * from "./contracts/session";
export * from "./contracts/time";
export * from "./protocol/errors";
export * from "./protocol/messages";
export * from "./arrow/checksum";
