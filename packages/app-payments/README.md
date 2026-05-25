# @elata-biosciences/app-payments

In-app purchases for sandboxed apps running in the [Elata appstore](https://github.com/Elata-Biosciences/elata-appstore).

The appstore renders apps inside a sandboxed iframe with no wallet or backend access. This package lets the app request a purchase from the parent frame, which owns the payment UI (PayEmbed, wallet, on-chain settlement). The app just declares intent and awaits the verdict.

## Install

```sh
pnpm add @elata-biosciences/app-payments
```

## Usage

```ts
import { requestPurchase } from "@elata-biosciences/app-payments";

async function onChickenStand() {
  const result = await requestPurchase({
    contentId: 7,           // issued by the host when the listing was created
    priceUsdc: "0.01",      // display hint — host refetches the authoritative price
    title: "Chicken",
    description: "Unlocks the next level.",
  });

  switch (result.status) {
    case "success":
      unlockNextLevel();
      console.log("paid in tx", result.txHash);
      break;
    case "cancelled":
      // user closed the modal — leave them where they are
      break;
    case "error":
      showError(result.error);
      break;
  }
}
```

The promise never rejects on a normal `cancelled` / `error` outcome — those are part of the resolved value. It only rejects on:

| Code            | Meaning                                                       |
|-----------------|---------------------------------------------------------------|
| `invalid_input` | `contentId` was not a non-negative integer (or similar)       |
| `no_window`     | not running in a browser environment                          |
| `no_parent`     | not running inside an iframe                                  |
| `no_crypto`     | `crypto.randomUUID` is unavailable                            |
| `timeout`       | no response within `timeoutMs` (default 5 minutes)            |

All errors are instances of `AppPaymentsError` with a `.code` field.

## How it works

1. Generates a `requestId` via `crypto.randomUUID()`.
2. Posts `{ type: "elata:iap:request", requestId, contentId, ... }` to `window.parent`.
3. Listens for `{ type: "elata:iap:result", requestId, status, ... }` from the parent.
4. Resolves the promise; cleans up the listener and timer.

The parent validates the message source against the app's registered origin before opening the payment modal, refetches the authoritative price from its API (the `priceUsdc` you send is display-only), runs the on-chain settlement, and replies back to the iframe.

## Security model

- The app cannot fabricate ownership. Entitlements are written server-side after the on-chain transaction confirms.
- The app cannot read card details, wallet keys, or session tokens. The parent owns those surfaces.
- The price the app sends is a hint. The host always refetches.
- Each `requestId` is unique; the host's purchase API has `(userId, requestId)` uniqueness so a replayed request returns the existing ownership without charging again.

## Versioning

This package is `0.x` and the protocol is `v1`. Breaking protocol changes will bump both the package major version and the protocol version field.
