/**
 * Wire protocol between the sandboxed app (client) and the appstore host.
 *
 * One-shot request/response over `window.parent.postMessage`. The app sends an
 * `elata:iap:request`; the parent renders a payment modal outside the iframe
 * and replies with an `elata:iap:result` matching on `requestId`.
 *
 * The host (PlayHeader) validates `event.origin === embedOrigin` before
 * accepting a request. The app sends with target origin `"*"` because it does
 * not know its parent's origin; the host-side origin check is what matters.
 */

export const PROTOCOL_VERSION = 1 as const;
export const REQUEST_MESSAGE_TYPE = "elata:iap:request" as const;
export const RESULT_MESSAGE_TYPE = "elata:iap:result" as const;
export const HAS_ITEM_MESSAGE_TYPE = "elata:iap:hasItem" as const;
export const HAS_ITEM_RESULT_MESSAGE_TYPE = "elata:iap:hasItem:result" as const;
export const LIST_OWNED_MESSAGE_TYPE = "elata:iap:listOwned" as const;
export const LIST_OWNED_RESULT_MESSAGE_TYPE =
	"elata:iap:listOwned:result" as const;
export const GET_CATALOG_MESSAGE_TYPE = "elata:iap:getCatalog" as const;
export const GET_CATALOG_RESULT_MESSAGE_TYPE =
	"elata:iap:getCatalog:result" as const;

/** Host-enforced bounds on `requestId` length. Mirror these on the client. */
export const REQUEST_ID_MIN_LENGTH = 8;
export const REQUEST_ID_MAX_LENGTH = 128;

export interface IapRequestMessage {
	type: typeof REQUEST_MESSAGE_TYPE;
	requestId: string;
	contentId: number;
	/** Display hint only — the host refetches the authoritative price. */
	priceUsdc?: string;
	title?: string;
	description?: string;
}

export type IapStatus = "success" | "cancelled" | "error";

export interface IapResultMessage {
	type: typeof RESULT_MESSAGE_TYPE;
	requestId: string;
	status: IapStatus;
	txHash?: string;
	error?: string;
}

export function isIapResultMessage(value: unknown): value is IapResultMessage {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.type !== RESULT_MESSAGE_TYPE) return false;
	if (typeof v.requestId !== "string") return false;
	if (
		v.status !== "success" &&
		v.status !== "cancelled" &&
		v.status !== "error"
	) {
		return false;
	}
	return true;
}

/**
 * Entitlement query: does the session user own a given offchain item?
 * Reply is `IapHasItemResultMessage`.
 */
export interface IapHasItemMessage {
	type: typeof HAS_ITEM_MESSAGE_TYPE;
	requestId: string;
	contentId: number;
}

export interface IapHasItemResultMessage {
	type: typeof HAS_ITEM_RESULT_MESSAGE_TYPE;
	requestId: string;
	/** Present when the query succeeded. */
	owned?: boolean;
	/** Present when the query failed (e.g. `not_authenticated`, `fetch_failed`). */
	error?: string;
}

export function isIapHasItemResultMessage(
	value: unknown,
): value is IapHasItemResultMessage {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.type !== HAS_ITEM_RESULT_MESSAGE_TYPE) return false;
	if (typeof v.requestId !== "string") return false;
	return true;
}

/**
 * Entitlement query: list every offchain `contentId` the session user owns
 * for this app. Reply is `IapListOwnedResultMessage`.
 */
export interface IapListOwnedMessage {
	type: typeof LIST_OWNED_MESSAGE_TYPE;
	requestId: string;
}

export interface IapListOwnedResultMessage {
	type: typeof LIST_OWNED_RESULT_MESSAGE_TYPE;
	requestId: string;
	ownedContentIds?: number[];
	error?: string;
}

export function isIapListOwnedResultMessage(
	value: unknown,
): value is IapListOwnedResultMessage {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.type !== LIST_OWNED_RESULT_MESSAGE_TYPE) return false;
	if (typeof v.requestId !== "string") return false;
	return true;
}

/**
 * A single offchain item listing as returned by `getCatalog()`. Mirrors the
 * host's `/api/apps/[tokenAddress]/catalog` response shape.
 */
export interface CatalogItem {
	contentId: number;
	title: string;
	description?: string | null;
	imageUrl?: string | null;
	/** USDC price in base units (6 decimals). e.g. `"50000"` = $0.05. */
	priceUsdc: string;
}

/**
 * Catalog query: list every active offchain item the host has registered
 * for this app. Reply is `IapGetCatalogResultMessage`.
 */
export interface IapGetCatalogMessage {
	type: typeof GET_CATALOG_MESSAGE_TYPE;
	requestId: string;
}

export interface IapGetCatalogResultMessage {
	type: typeof GET_CATALOG_RESULT_MESSAGE_TYPE;
	requestId: string;
	items?: CatalogItem[];
	error?: string;
}

export function isIapGetCatalogResultMessage(
	value: unknown,
): value is IapGetCatalogResultMessage {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	if (v.type !== GET_CATALOG_RESULT_MESSAGE_TYPE) return false;
	if (typeof v.requestId !== "string") return false;
	return true;
}
