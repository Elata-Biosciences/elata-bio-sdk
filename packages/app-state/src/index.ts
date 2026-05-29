/**
 * Public API for sandboxed apps. The appstore host has its own listener
 * inside the parent frame; apps do not import anything from this package
 * to handle responses — they `await getState(...)` / `setState(...)` /
 * `deleteState(...)`.
 */

export {
	AppStateError,
	deleteState,
	getState,
	setState,
} from "./client";
export type { AppStateErrorCode, StateOptions } from "./client";
