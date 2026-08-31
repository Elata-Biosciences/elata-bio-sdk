/**
 * `@elata-biosciences/biosignal-session/testing` — deterministic synthetic
 * sources, fakes, and fault-injection helpers for consumers' test suites.
 *
 * Fault injection lives on the in-memory host (`createMemoryHost`):
 * `dropNextAck`, `failNextCommitWith`, `corruptNextPayload`, and
 * `pause`/`resume` for backpressure scenarios.
 */

export * from "./testing/prng";
export * from "./testing/fakeClock";
export * from "./testing/memoryHost";
export * from "./testing/syntheticSource";
export * from "./testing/recorderHarness";
