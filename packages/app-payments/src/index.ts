/**
 * Public API for sandboxed apps. The appstore host has its own listener
 * inside the parent frame; apps do not import anything from this package
 * to handle responses — they `await requestPurchase(...)`.
 */

export {
	AppPaymentsError,
	getOwnedItems,
	hasItem,
	requestPurchase,
} from "./client";
export type {
	AppPaymentsErrorCode,
	EntitlementQueryInput,
	PurchaseCancelled,
	PurchaseError,
	PurchaseResult,
	PurchaseSuccess,
	RequestPurchaseInput,
} from "./client";
export type { IapStatus } from "./protocol";
