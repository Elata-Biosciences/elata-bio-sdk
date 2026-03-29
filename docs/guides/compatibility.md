# Compatibility

This page collects the current high-level compatibility expectations for the
published Elata SDK surfaces.

## Package And Tooling Expectations

| Surface | Browser runtime | Node.js | Notes |
|---------|------------------|---------|-------|
| `@elata-biosciences/create-elata-demo` | n/a | `>= 18` | CLI scaffolder only |
| `@elata-biosciences/eeg-web` | modern browser with WebAssembly | `>= 20` | Node requirement is for package/tooling compatibility; browser usage depends on serving packaged WASM assets |
| `@elata-biosciences/eeg-web-ble` | Chrome or Edge with Web Bluetooth | `>= 20` | depends on `@elata-biosciences/eeg-web` |
| `@elata-biosciences/rppg-web` | modern browser with camera and WebAssembly | `>= 20` | packaged WASM assets must be reachable by the browser |

## Browser Support

| Workflow | Chrome / Edge | Safari macOS | Safari iOS | Notes |
|----------|----------------|--------------|------------|-------|
| `create-elata-demo` | n/a | n/a | n/a | scaffolder runs in Node |
| EEG WASM with `eeg-web` | Supported | Supported | Supported | requires packaged `wasm/` assets |
| Muse browser BLE with `eeg-web-ble` | Supported in secure context | Not supported for this workflow | Not supported for this workflow | requires Web Bluetooth |
| rPPG with `rppg-web` | Supported | Supported | Supported with camera permissions | requires packaged `pkg/` assets |

## Web Bluetooth Support

Current browser BLE expectations:

- use Chrome or Edge
- run on `https://` or `localhost`
- enable Bluetooth on the machine
- expect Safari and iOS browser BLE to be unsupported for this workflow

## Supported Device Classes

Current device classes referenced by this repo:

- Muse 2 and Muse S classic BLE devices
- Muse S Athena protocol v2 devices
- the synthetic Muse-compatible BLE bridge used for testing

## Safari And iOS Notes

- `eeg-web` can be used as a browser-side WASM package on Safari when your app serves its packaged assets correctly.
- `eeg-web-ble` is not a Safari or iOS browser workflow.
- `rppg-web` can run on Safari and iOS, but camera permissions and packaged WASM delivery still need to be correct.

## Package Manager Notes

- Generated scaffolded apps work with `pnpm` or `npm`.
- This repo prefers `pnpm` for local development.
- If you scaffold an app inside another `pnpm` workspace and do not add it to the workspace globs, use:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```

## Related Guides

- [getting-started.md](getting-started.md)
- [using-eeg-in-a-browser-app.md](using-eeg-in-a-browser-app.md)
- [using-web-bluetooth-with-supported-devices.md](using-web-bluetooth-with-supported-devices.md)
- [using-rppg-in-a-browser-app.md](using-rppg-in-a-browser-app.md)
- [troubleshooting.md](troubleshooting.md)
