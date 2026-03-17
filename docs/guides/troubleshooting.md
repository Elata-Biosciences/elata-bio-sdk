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

If you are unsure, compare your app with the scaffolded `rppg-web-demo`.

## I am not sure which package I need

Start with [choose-the-right-package.md](/Users/khan/Documents/Projects/elata-bio-sdk/docs/guides/choose-the-right-package.md).

If you still just want the fastest path, use `create-elata-demo`.
