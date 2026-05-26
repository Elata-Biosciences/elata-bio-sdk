---
"@elata-biosciences/app-payments": minor
---

Add `@elata-biosciences/app-payments`: in-app purchases for sandboxed apps in
the Elata App Store. Apps call `requestPurchase({ contentId, priceUsdc, ... })`
and `await` the verdict; the package posts an `elata:iap:request` message to
the parent frame, which owns the payment UI (Thirdweb `CheckoutWidget`, wallet
or card funding, on-chain USDC settlement) and replies with success / cancelled
/ error. The price the app sends is a display hint — the host refetches the
authoritative price before charging. Each request is uniquely identified by a
`crypto.randomUUID()` `requestId`, giving the host idempotency on retries. The
package exports `requestPurchase`, `AppPaymentsError`, and the `PurchaseResult`
union. Browser-only.
