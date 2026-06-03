# IAP demo — canonical in-app purchase pattern

A tiny, self-contained reference for `@elata-biosciences/app-payments`. It's the
"clone this" example for adding in-app purchases to an app that runs in the Elata
appstore. One file, no build step: [`index.html`](./index.html) imports the real
published SDK from a CDN.

## Run it

```sh
# any static server works; from this directory:
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in a browser. Either way it runs **standalone**
via a built-in mock host — no appstore, wallet, or backend required.

## What it demonstrates

It walks the full correct flow end to end:

1. **Catalog render** — `getCatalog()` lists items with host-authoritative
   price/title (falls back to a bundled list if the host can't answer).
2. **Ownership-gated UI** — `getOwnedItems()` on load; owned items show
   "Owned ✓ / Use it", unowned show "Buy". (See the *two rules* in the
   integration guide — never offer Buy on something already owned.)
3. **Purchase** — `requestPurchase()` with all three result branches handled
   visibly: success toast, silent cancel, error banner.
4. **Applied, persisted benefit** — owning an item unlocks a real effect
   (e.g. the Dark Mode perk flips the theme). Effects are re-derived from
   ownership on every load, so they survive a refresh — the host is the source
   of truth.
5. **Already-owned path** — the *"Demo: re-buy an owned item"* button shows that
   re-purchasing returns `success` with an **empty `txHash`** and applies the
   benefit without a second charge. The code branches on `result.status`, never
   on `txHash` truthiness.
6. **Cancel branch** — the mock checkout's *Cancel* button exercises the
   `cancelled` result (a no-op, as it should be).

## The mock host (delete it in a real app)

A real app ships **none** of the mock — it just calls the SDK and the appstore
parent answers. To let this file run with no backend, it includes a clearly
fenced **DEV-ONLY MOCK HOST** block that answers the SDK's `postMessage` calls
(`getCatalog`, `listOwned`, `hasItem`, `request`) and pops a simulated checkout.

Every SDK call here passes an optional `window` so the SDK talks to the mock
instead of the real parent. Remove the mock block and the `iapOpts(...)` wrapper
and you have an ordinary embedded app.

- **Standalone** (opened directly): mock host is on by default.
- **Embedded** (served inside the appstore): mock is off; the real host answers.
  Use the *"Use mock host"* toggle to force the mock even when embedded.

## Note on host support

`getCatalog` and `requestPurchase` are handled by the live appstore host today.
The ownership queries (`getOwnedItems` / `hasItem`) require the host-side
entitlement handlers (appstore PR #472). Until those ship, the demo **degrades
gracefully** against a real host: an ownership-query timeout shows a banner and
falls back to displaying every item as available, rather than dead-ending the
UI. The mock host implements all four, so the full flow is demonstrable here now.

## See also

- `IAP_SDK_INTEGRATION.md` in the appstore repo — the full integration guide.
- Package source: `packages/app-payments`.
