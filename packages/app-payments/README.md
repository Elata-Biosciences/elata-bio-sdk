# @elata-biosciences/app-payments

In-app purchases for sandboxed apps running in the [Elata appstore](https://github.com/Elata-Biosciences/elata-appstore).

The appstore renders apps inside a sandboxed iframe with no wallet or backend access. This package lets the app **request a purchase** from the parent frame and **read what the user owns**, all over `postMessage`. The parent owns the payment UI (PayEmbed, wallet, on-chain settlement) and the session. Your app declares intent and reads entitlements; it never touches wallets, USDC, or transaction signing.

## Install

```sh
pnpm add @elata-biosciences/app-payments
```

## The API surface

```ts
import {
  requestPurchase,
  hasItem,
  getOwnedItems,
  getCatalog,
  AppPaymentsError,
} from "@elata-biosciences/app-payments";
```

| Function | Signature | Returns | Use it to |
|----------|-----------|---------|-----------|
| `requestPurchase` | `(input: RequestPurchaseInput)` | `Promise<PurchaseResult>` | Start a purchase; opens the host checkout |
| `hasItem` | `(contentId: number, opts?)` | `Promise<boolean>` | Check whether the user owns one item |
| `getOwnedItems` | `(opts?)` | `Promise<number[]>` | List every owned `contentId` (sorted) |
| `getCatalog` | `(opts?)` | `Promise<CatalogItem[]>` | List the app's items (price/title/desc) |

You are responsible for exactly two things: **read entitlements to decide what to show**, and **react to the purchase result** (grant the benefit on success; handle cancel/error gracefully). The host does everything else.

## The correct flow

Don't call `requestPurchase` in isolation. Gate the UI on ownership first, then purchase, then apply and persist the benefit:

```ts
import {
  getCatalog,
  getOwnedItems,
  requestPurchase,
  AppPaymentsError,
} from "@elata-biosciences/app-payments";

// 1. Read the catalog and what the user already owns.
const [items, owned] = await Promise.all([getCatalog(), getOwnedItems()]);
const ownedSet = new Set(owned);

// 2. Render: owned items show "Use", unowned show "Buy".
function render() {
  for (const item of items) {
    const isOwned = ownedSet.has(item.contentId);
    // isOwned ? showUse(item) : showBuy(item)
  }
}

// 3. Buy. Branch on result.status.
async function buy(item) {
  try {
    const result = await requestPurchase({
      contentId: item.contentId,
      priceUsdc: formatUsdc(item.priceUsdc), // display hint only (see below)
      title: item.title,
      description: item.description ?? undefined,
    });
    switch (result.status) {
      case "success":
        ownedSet.add(item.contentId);
        applyBenefit(item.contentId); // 4. grant the effect now…
        render();
        break;
      case "cancelled":
        break; // user backed out before paying — no-op
      case "error":
        showError(result.error);
        break;
    }
  } catch (err) {
    // Thrown only for SDK-level problems (no parent, bad input, timeout).
    showError(err instanceof AppPaymentsError ? `${err.code}: ${err.message}` : String(err));
  }
}

// 5. On startup, re-derive ownership and re-apply — the host is the source of
// truth, so the benefit survives reloads without any local persistence.
for (const id of owned) applyBenefit(id);
```

`requestPurchase` records *that* the user owns an item. **Your app** decides what owning it *does* — the `applyBenefit` step is the part that's actually a feature.

## Purchasing

`RequestPurchaseInput`:

```ts
{ contentId: number; priceUsdc?: string; title?: string; description?: string; timeoutMs?: number }
```

`priceUsdc` / `title` / `description` are **display hints only** — the host refetches the authoritative listing and overrides them. `requestPurchase` defaults to a **5-minute** timeout.

`PurchaseResult` is a discriminated union — branch on `status`:

```ts
{ status: "success",   requestId: string, txHash: string }
{ status: "cancelled", requestId: string }
{ status: "error",     requestId: string, error: string }
```

The promise **never rejects** on a normal `cancelled` / `error` outcome — those are part of the resolved value. It only rejects (throwing `AppPaymentsError`) on local failures: see the error table below.

### The empty-`txHash` gotcha

When the user **already owns** the item, the host short-circuits and returns
`{ status: "success", txHash: "" }`. If you key off `if (result.txHash)` you'll
mishandle the already-owned case. **Branch on `result.status`, never on `txHash`
truthiness.**

## Reading entitlements

```ts
if (await hasItem(7)) unlockPermanentSkin();
const owned = await getOwnedItems(); // e.g. [1, 4, 7]
```

Both take an optional `{ timeoutMs?, window? }` (default timeout **10 s**) and follow the same error model as below.

> **Host support:** `hasItem` / `getOwnedItems` require the appstore's offchain
> entitlement handlers ([appstore PR #472](https://github.com/Elata-Biosciences/elata-appstore/pull/472)).
> Until that ships, calls against the live host **time out**. Degrade gracefully:
> use a short `timeoutMs` and, on timeout, fall back to showing items as
> available rather than dead-ending the UI.

```ts
let ownedSet;
try {
  ownedSet = new Set(await getOwnedItems({ timeoutMs: 4000 }));
} catch (err) {
  if (err instanceof AppPaymentsError && err.code === "timeout") {
    ownedSet = new Set();        // ownership unknown — show everything as buyable
  } else throw err;
}
```

## The catalog and price units

`getCatalog()` returns the app's active listings so you don't hard-code IDs or prices:

```ts
interface CatalogItem {
  contentId: number;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  priceUsdc: string; // USDC in BASE UNITS (6 decimals): "50000" === $0.05
}
```

**Mind the two price conventions** — they share a field name but differ:

- `CatalogItem.priceUsdc` is **base units** (6 decimals). Format it for display:
  ```ts
  const formatUsdc = (base: string) => `$${(Number(base) / 1e6).toFixed(2)}`;
  formatUsdc("50000"); // "$0.05"
  ```
- `RequestPurchaseInput.priceUsdc` is a **free-form display hint** the SDK does
  not interpret and the host overrides. Pass whatever you'd show the user
  (e.g. the formatted string above).

## Error model

`requestPurchase` rejects, and the entitlement queries reject, only with `AppPaymentsError` (has a `.code`):

| Code | Meaning |
|------|---------|
| `invalid_input` | `contentId` was not a non-negative integer (or a bad option type) |
| `no_window` | not running in a browser environment |
| `no_parent` | not running inside an iframe with an appstore parent |
| `no_crypto` | `crypto.randomUUID` is unavailable |
| `timeout` | no response within `timeoutMs` |
| `not_authenticated` | host reports no signed-in user (entitlement queries) |
| `fetch_failed` | host failed to look up entitlements |

## How it works

1. Generates a `requestId` via `crypto.randomUUID()`.
2. Posts `{ type: "elata:iap:request", requestId, contentId, ... }` to `window.parent`.
3. Listens for the matching `{ type: "elata:iap:result", requestId, ... }` reply.
4. Resolves the promise; cleans up the listener and timer.

The entitlement queries work the same way with their own message types (`elata:iap:hasItem`, `elata:iap:listOwned`, `elata:iap:getCatalog`). The parent validates the message source against the app's registered origin before responding, refetches authoritative data, and replies.

## Security model

- The app **cannot fabricate ownership**. Entitlements are written server-side only after the on-chain transaction confirms; the app just reads them.
- The app **cannot read** card details, wallet keys, or session tokens. The parent owns those surfaces.
- The price the app sends is a **hint**; the host always refetches the authoritative price.
- **Replay safety is per-request, not single-ownership enforcement.** The host keys on `(userId, requestId)`, so re-sending the *same* request is idempotent and won't double-charge. A *fresh* `requestId` for an item the user already owns records another entitlement row — the checkout UI is what discourages repeat buys, the server does not forbid them. Treat the host (via `getOwnedItems` / `hasItem`) as the source of truth for what a user owns.

## Try it

- **Runnable demo:** [`examples/iap-demo`](https://github.com/Elata-Biosciences/elata-bio-sdk/tree/main/examples/iap-demo) — one self-contained `index.html` that runs standalone via a built-in mock host, exercising the full flow.
- **Guide:** [Using IAP in a browser app](https://github.com/Elata-Biosciences/elata-bio-sdk/blob/main/docs/guides/using-iap-in-a-browser-app.md).
- **Platform integration guide:** `IAP_SDK_INTEGRATION.md` in the appstore repo (host-side details, product model, known gaps).

## Versioning

This package is `0.x` and the protocol is `v1`. Breaking protocol changes will bump both the package major version and the protocol version field.
