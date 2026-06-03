# Using IAP In A Browser App

How to add in-app purchases to an app that runs in the Elata appstore, using
`@elata-biosciences/app-payments`. Your app runs in a sandboxed iframe with no
wallet or session access — it talks to the appstore host over `postMessage`, and
this package wraps that protocol.

## Start With The Fastest Path

If you want a working reference before integrating manually, clone the demo. It
is one self-contained file that runs standalone via a built-in mock host:

```bash
git clone https://github.com/Elata-Biosciences/elata-bio-sdk
cd elata-bio-sdk/examples/iap-demo
npx serve .   # or open index.html directly
```

It exercises the whole flow — catalog, ownership-gated UI, purchase (success /
cancel / error), and an applied, reload-persisted benefit. Use this guide when
you want to add purchasing to an existing app.

## Install

```bash
pnpm add @elata-biosciences/app-payments
npm install @elata-biosciences/app-payments
```

## What `app-payments` Gives You

`@elata-biosciences/app-payments` exports four functions and one error type:

- `requestPurchase()` — start a purchase; the host opens checkout and settles it
- `getOwnedItems()` — list every `contentId` the user owns for this app
- `hasItem(contentId)` — check ownership of a single item
- `getCatalog()` — list the app's active items (price/title/description)
- `AppPaymentsError` — thrown for local/host failures (`.code`)

The host owns the wallet, payment modal, on-chain verification, and entitlement
records. Your app declares intent and reads results.

## The Two Rules People Get Wrong

1. **Gate the UI on ownership.** Before showing a "Buy" button, ask the host
   what the user already owns and adapt — owned items show "Use", unowned show
   "Buy". Skip this and an owner sees a Buy button that dead-ends at "you already
   own this" with no way to *use* what they paid for.
2. **Branch on `result.status`, never on `txHash`.** When the user already owns
   the item, the host returns `success` with an **empty `txHash`**. Keying off
   `if (result.txHash)` mishandles the already-owned case.

## Minimal Integration

```ts
import {
  getCatalog,
  getOwnedItems,
  requestPurchase,
  AppPaymentsError,
} from "@elata-biosciences/app-payments";

const [items, owned] = await Promise.all([getCatalog(), getOwnedItems()]);
const ownedSet = new Set(owned);

async function buy(item) {
  try {
    const result = await requestPurchase({
      contentId: item.contentId,
      title: item.title,
      priceUsdc: `$${(Number(item.priceUsdc) / 1e6).toFixed(2)}`, // display hint
    });
    if (result.status === "success") {
      ownedSet.add(item.contentId);
      applyBenefit(item.contentId); // your app decides what owning it does
    } else if (result.status === "error") {
      showError(result.error);
    } // "cancelled" → no-op
  } catch (err) {
    showError(err instanceof AppPaymentsError ? `${err.code}: ${err.message}` : String(err));
  }
}

// On startup, re-derive ownership and re-apply — the host is the source of
// truth, so benefits survive reloads with no local persistence.
for (const id of owned) applyBenefit(id);
```

## Typical Integration Flow

1. On mount, call `getCatalog()` and `getOwnedItems()`.
2. Render owned items as "Use", unowned as "Buy".
3. On Buy, call `requestPurchase()` and handle all three result branches.
4. On `success`, grant the effect immediately and re-render.
5. On reload, re-read ownership and re-apply — don't trust local state alone.

## Price Units

`CatalogItem.priceUsdc` is **USDC base units** (6 decimals): `"50000"` is `$0.05`.
Format it for display with `(Number(p) / 1e6).toFixed(2)`. The `priceUsdc` you
pass to `requestPurchase` is a **free-form display hint** the SDK does not
interpret and the host overrides — pass the formatted string.

## Host Support And Graceful Degradation

`getCatalog` and `requestPurchase` are handled by the live host today. The
ownership queries (`getOwnedItems` / `hasItem`) require the appstore's offchain
entitlement handlers ([appstore PR #472](https://github.com/Elata-Biosciences/elata-appstore/pull/472)).
Until that ships, those calls **time out** against the live host. Don't
dead-end — use a short `timeoutMs` and fall back to showing items as available:

```ts
let ownedSet;
try {
  ownedSet = new Set(await getOwnedItems({ timeoutMs: 4000 }));
} catch (err) {
  if (err instanceof AppPaymentsError && err.code === "timeout") ownedSet = new Set();
  else throw err;
}
```

## Common Gotchas

- **`no_parent` thrown:** you're not inside an appstore iframe. The SDK posts to
  `window.parent`; run it embedded, or pass a mock `window` for local dev (see
  the demo's mock host).
- **Empty `txHash` on success:** that's the already-owned short-circuit, not a
  bug. Branch on `status`.
- **Repeat purchases:** the server does not enforce single-ownership; the
  checkout UI soft-blocks re-buying an owned item. You cannot build a "spend each
  run" consumable on one `contentId` today.
- **`getCatalog` missing from an older install:** it shipped after npm `0.2.0`.
  Use `>= 0.3.0`, or feature-detect with a namespace import.

## Version Guidance

Use `@elata-biosciences/app-payments` `>= 0.3.0` for `getCatalog`. The package is
`0.x` and the wire protocol is `v1`; breaking protocol changes bump both.

## Next Steps

- For the full API, see [packages/app-payments/README.md](../../packages/app-payments/README.md).
- For the runnable reference, see [examples/iap-demo](../../examples/iap-demo).
- For platform/host details and the product model, see `IAP_SDK_INTEGRATION.md`
  in the appstore repo.
