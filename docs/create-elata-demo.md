## Elata Demo Scaffolding (`create-elata-demo`)

This repo ships a small scaffolder package to generate ready-to-run Elata web demos:

- **Package**: `@elata-biosciences/create-elata-demo`
- **CLI name**: `create-elata-demo`
- **Usage style**: standard npm "create" convention

Use it when you want a working demo app that already wires up the Elata SDK and Vite, either as:

- a starting point for a new project, or
- a reference you can compare against your own app.

### Templates

The scaffolder exposes multiple templates:

- `rppg-web-demo` – React + Vite rPPG heart-rate demo
- `eeg-web-demo` – React + Vite EEG WASM demo
- `eeg-web-ble-demo` – React + Vite Muse Web Bluetooth EEG demo

You can list templates from any environment:

```bash
pnpm dlx @elata-biosciences/create-elata-demo -- --list-templates
npx @elata-biosciences/create-elata-demo -- --list-templates
```

### Creating a new demo app

The recommended entry point is the npm "create" flow:

```bash
# RPPG web demo (default template)
npm create @elata-biosciences/elata-demo my-app

# EEG web demo
npm create @elata-biosciences/elata-demo my-app -- --template eeg-web-demo

# EEG Web Bluetooth demo (Muse-compatible)
npm create @elata-biosciences/elata-demo my-app -- --template eeg-web-ble-demo
```

Behind the scenes this runs the `create-elata-demo` binary, which:

- prompts for `projectName` when missing,
- validates the template name,
- copies the chosen template into the target directory,
- renames `_gitignore` → `.gitignore`, and
- rewrites placeholders like `__APP_NAME__`.

Each generated app includes:

- a `package.json` pinned to the current compatible Elata SDK package versions,
- a minimal React + Vite shell, and
- a template-specific `README.md` with browser and hardware notes,
- a `build` script that Type-checks and runs `vite build`.

After scaffolding:

```bash
cd my-app
pnpm install
pnpm run dev
npm install
npm run dev
```

> Note: The templates are compatible with `pnpm` and other package managers; this repo prefers `pnpm` for local work.
>
> If you scaffold **inside an existing pnpm workspace** but do not add the new app
> to that workspace's `pnpm-workspace.yaml`, run this from the parent directory:
>
> ```bash
> pnpm --dir my-app --ignore-workspace install
> pnpm --dir my-app --ignore-workspace run dev
> ```
>
> or use `npm install` / `npm run dev` from inside `my-app`.

### Using `pnpm dlx` directly

If you prefer not to go through the npm "create" alias, you can invoke the scaffolder package explicitly:

```bash
pnpm dlx @elata-biosciences/create-elata-demo my-app --template rppg-web-demo
npx @elata-biosciences/create-elata-demo my-app --template rppg-web-demo
```

This is equivalent to the `npm create @elata-biosciences/elata-demo` examples above.

### Repo-level smoke tests

The repo treats demo scaffolding as part of its test surface.

From the repo root:

```bash
./run.sh test create-elata-demo
```

This command:

1. Ensures `node_modules/` exists at the workspace root (`pnpm install` if needed).
2. Runs the `packages/create-elata-demo` test suite.
3. For each template (`rppg-web-demo`, `eeg-web-demo`, `eeg-web-ble-demo`):
   - scaffolds into a temporary directory,
   - installs dependencies with `pnpm install`, and
   - runs `pnpm run build` (Vite + TypeScript).

This gives us a fast end-to-end smoke test that:

- catches template breakages when SDK exports change,
- validates that dependencies resolve and compile, and
- keeps the published `create-elata-demo` flow aligned with the repo demos.

### When to use the scaffolder vs. examples

- **Use `@elata-biosciences/create-elata-demo`** when you want:
  - a clean, self-contained demo app,
  - pinned dependencies, and
  - a flow that mirrors what end users will see on npm.

- **Use the in-repo demos (e.g. `eeg-demo/`, `rppg-web` demo tooling)** when you:
  - are developing the SDK itself,
  - need deeper debugging hooks, or
  - want to iterate on WASM and analysis internals.
