## Elata App Scaffolding (`create-elata-demo`)

This repo ships a small scaffolder package to generate ready-to-run Elata web apps:

- **Package**: `@elata-biosciences/create-elata-demo`
- **CLI name**: `create-elata-demo`
- **Usage style**: standard npm "create" convention

Use it when you want a working scaffolded app that already wires up the Elata SDK and Vite, either as:

- a starting point for a new project, or
- a reference you can compare against your own app.

### Templates

The scaffolder exposes three user-facing app starters:

- `rppg-demo` – React + Vite rPPG starter app
- `eeg-demo` – React + Vite EEG starter app with synthetic data and browser EEG wiring
- `eeg-ble` – Muse-compatible EEG starter path with Chrome or Bluefy-on-iOS Web Bluetooth guidance

Short aliases and compatibility names are also supported:

- `rppg` → `rppg-demo`
- `eeg` → `eeg-demo`
- `ble` → `eeg-ble`
- `eeg-web-ble-demo` → `eeg-ble`

`eeg-ble` is its own BLE-first scaffold. It starts in the headset flow and
includes on-screen references to the repo's iOS and Android native demo
surfaces.

You can list templates from any environment:

```bash
pnpm dlx @elata-biosciences/create-elata-demo -- --list-templates
npx @elata-biosciences/create-elata-demo -- --list-templates
```

### Creating a new app

The recommended entry point is the npm "create" flow:

```bash
# Interactive template chooser
npm create @elata-biosciences/elata-demo my-app

# rPPG starter app (alias)
npm create @elata-biosciences/elata-demo my-app -- --template rppg

# EEG starter app
npm create @elata-biosciences/elata-demo my-app -- --template eeg-demo

# EEG starter app (alias)
npm create @elata-biosciences/elata-demo my-app -- --template eeg

# EEG starter app with BLE alias
npm create @elata-biosciences/elata-demo my-app -- --template eeg-ble

# EEG starter app with the short BLE alias
npm create @elata-biosciences/elata-demo my-app -- --template ble
```

When the CLI is run interactively without `--template`, it first prompts you to
pick which app type you want, then asks for the project name. In
non-interactive runs, it still defaults to `rppg-demo`.

If you omit the project directory, the CLI also prompts for the project name.

Behind the scenes this runs the `create-elata-demo` binary, which:

- prompts for the app type first when running interactively without `--template`,
- prompts for `projectName` when missing,
- validates the selected starter name,
- copies the chosen template into the target directory,
- renames `_gitignore` → `.gitignore`, and
- rewrites placeholders like `__APP_NAME__` and package-version placeholders.

Each scaffolded app includes:

- a `package.json` pinned to the current compatible Elata SDK package versions,
- a minimal React + Vite shell, and
- a template-specific `README.md` with browser and hardware notes,
- a `build` script that Type-checks and runs `vite build`.

After scaffolding:

```bash
cd my-app
npm install
npm run dev
pnpm install
pnpm run dev
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
pnpm dlx @elata-biosciences/create-elata-demo my-app
npx @elata-biosciences/create-elata-demo my-app
pnpm dlx @elata-biosciences/create-elata-demo my-app --template rppg
pnpm dlx @elata-biosciences/create-elata-demo my-app --template eeg
```

This is equivalent to the `npm create @elata-biosciences/elata-demo` flows above. Pass `--template` when you want a specific template without the interactive chooser.

### Repo-level smoke tests

The repo treats app scaffolding as part of its test surface.

From the repo root:

```bash
./run.sh test create-elata-demo
```

This command:

1. Ensures `node_modules/` exists at the workspace root (`pnpm install` if needed).
2. Runs the `packages/create-elata-demo` test suite.
3. For each template (`rppg-demo`, `eeg-demo`, `eeg-ble`):
   - scaffolds into a temporary directory,
   - installs dependencies with `pnpm install`, and
   - runs `pnpm run build` (Vite + TypeScript).

This gives us a fast end-to-end smoke test that:

- catches template breakages when SDK exports change,
- validates that dependencies resolve and compile, and
- keeps the published `create-elata-demo` flow aligned with the in-repo dev demos.

### When to use the scaffolder vs. examples

- **Use `@elata-biosciences/create-elata-demo`** when you want:
  - a clean, self-contained scaffolded app,
  - pinned dependencies, and
  - a flow that mirrors what end users will see on npm.

- **Use the in-repo dev demos (e.g. `eeg-demo/`, `packages/rppg-web/demo/`)** when you:
  - are developing the SDK itself,
  - need deeper debugging hooks, or
  - want to iterate on WASM and analysis internals.
