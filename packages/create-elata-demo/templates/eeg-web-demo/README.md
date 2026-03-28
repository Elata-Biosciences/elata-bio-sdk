# __APP_NAME__

This app was generated from the `__TEMPLATE_NAME__` template in
`@elata-biosciences/create-elata-demo`.

## What This Demo Shows

- browser-side EEG WASM initialization
- `@elata-biosciences/eeg-web` integration
- a simple synthetic signal analysis flow using band powers

## Requirements

- a modern browser with WebAssembly support
- `pnpm` or `npm` to install dependencies

## Run It

```text
pnpm:
pnpm install
pnpm run dev
```

If this app was created inside another `pnpm` workspace and is not part of that
workspace, run from the parent directory:

```text
pnpm:
pnpm --dir __APP_NAME__ --ignore-workspace install
pnpm --dir __APP_NAME__ --ignore-workspace run dev

npm:
cd __APP_NAME__
npm install
npm run dev
```

## Notes

- This template uses synthetic EEG data so it can run without hardware.
- If you need device transport as well, look at the `eeg-web-ble-demo` template.
