# @elata-biosciences/app-state

Per-user, per-app key-value storage for sandboxed apps in the Elata appstore.
Lets apps persist save games, settings, progress, and other small JSON blobs
without standing up their own backend and without ever seeing the user's
identity.

The host owns the database row scope and the session; this client just sends
a postMessage to `window.parent` and awaits a typed reply.

## Install

```sh
npm install @elata-biosciences/app-state
```

## Usage

```ts
import { getState, setState, deleteState } from "@elata-biosciences/app-state";

// Read the current save. `null` if nothing was ever stored.
const save = (await getState("save_slot_1")) as SaveGame | null;

// Persist a new save. JSON-serializable; capped at 64 KB per key on the host.
await setState("save_slot_1", { level: 7, hp: 100 });

// Remove a key. Idempotent — no error if the key was never set.
await deleteState("save_slot_1");
```

All three methods reject with `AppStateError` on failure. The `code` field
distinguishes local failures (`no_parent`, `timeout`, `invalid_input`) from
host-reported errors (`not_authenticated`, `value_too_large`, `fetch_failed`).

## Limits

- Keys: 1–256 chars from `A-Z a-z 0-9 . _ : / -`. Pick your own namespace.
- Values: any JSON-serializable type, ≤ 64 KB once encoded.
- The host's session model decides who "the user" is — anonymous sessions
  may exist on some chains; check `error: "not_authenticated"` if your app
  needs a signed-in user.

## Scope

This package is for **stateful** appstore interactions (save games, settings,
progress). For payments and entitlements, use
[`@elata-biosciences/app-payments`](../app-payments).
