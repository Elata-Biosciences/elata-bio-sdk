# --help-test-placeholder

This app was generated from the `rppg-web-demo` template in
`@elata-biosciences/create-elata-demo`.

## What This Demo Shows

- camera-based rPPG processing in the browser
- `createRppgSession()` as the recommended `@elata-biosciences/rppg-web` app entrypoint
- a simple metrics display for BPM, confidence, and signal quality
- session diagnostics like `backendMode`, `issues`, and `lastError`

## Requirements

- a modern browser with camera access
- permission to use the camera
- `pnpm` or `npm` to install dependencies

## Run It

```bash
pnpm install
pnpm run dev
```

If this app was created inside another `pnpm` workspace and is not part of that
workspace, run from the parent directory:

```bash
pnpm --dir --help-test-placeholder --ignore-workspace install
pnpm --dir --help-test-placeholder --ignore-workspace run dev
```

## Notes

- This template is meant as a quick integration starting point, not a finished product UI.
- It intentionally starts from `createRppgSession()` instead of lower-level `DemoRunner` or `RppgProcessor` wiring.
- If you need a deeper reference, compare this app with the monorepo `packages/rppg-web` demo tooling.
