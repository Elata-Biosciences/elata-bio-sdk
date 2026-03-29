# __APP_NAME__

This app was generated from the `__TEMPLATE_NAME__` template in
`@elata-biosciences/create-elata-demo`.

## What This Demo Shows

- camera-based rPPG processing in the browser
- `createRppgSession()` as the recommended `@elata-biosciences/rppg-web` app entrypoint
- a large BPM readout, confidence and signal-quality meters, and session chips tuned for demos
- expandable technical diagnostics (`backendMode`, `issues`, `lastError`, and related fields)

## Requirements

- a modern browser with camera access
- permission to use the camera
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

- This template is a polished integration starting point and works well for demos and screen recordings.
- It intentionally starts from `createRppgSession()` instead of lower-level `DemoRunner` or `RppgProcessor` wiring.
- It uses Vite `?url` imports for the packaged WASM files, so it does not rely on importing `/public/pkg/*` from source code.
- If you need a deeper reference, compare this app with the monorepo `packages/rppg-web` demo tooling.
