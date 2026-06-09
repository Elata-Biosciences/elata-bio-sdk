# Troubleshooting

## `pnpm install` did not create `node_modules` in my scaffolded app

You likely created the app inside another `pnpm` workspace. Run from the parent
directory:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```

## Web Bluetooth is unavailable

Check the following:

- use Chrome or Edge
- run on `https://` or `localhost`
- make sure Bluetooth is enabled on the machine
- do not expect this workflow to work in Safari or iOS

## `loadWasmBackend()` returned `null`

Make sure your app is serving the packaged `pkg/rppg_wasm.js` and `.wasm`
assets from a path the browser can reach.

If you are unsure, compare your app with the scaffolded `rppg-demo` app.

## My app shows its own 404 page when played on app.elata.bio

The appstore serves your app inside a sandboxed iframe under a subpath
(`/app/<your-slug>/play/raw`), not at the domain root. If your app uses a
history-based router (for example React Router's `BrowserRouter`, the default
in Lovable exports), route matching depends on `location.pathname`, so the
served subpath can land on your router's catch-all 404 page.

The platform rewrites the iframe history to `/` before your scripts run, so
recent appstore versions mask this. Still, do not depend on `location.pathname`:

- prefer a hash-based router (React Router `HashRouter`, or equivalent), or
- make your root route a splat (`path="*"`) instead of an exact `/`

Asset URLs are unaffected either way — the appstore injects a `<base href>`
that resolves relative asset paths through its proxy.

## I am not sure which package I need

Start with [choose-the-right-package.md](choose-the-right-package.md).

If you still just want the fastest path, use `create-elata-demo`.
