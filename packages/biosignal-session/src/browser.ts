/**
 * `@elata-biosciences/biosignal-session/browser` — browser recording entry.
 *
 * Re-exports the shared contracts plus the source adapter surface. The
 * recorder client and device adapters build on these types.
 */

export * from "./index";
export * from "./adapters/types";
export * from "./arrow/schemas";
export * from "./arrow/encode";
export * from "./arrow/decode";
