# @elata-biosciences/create-elata-demo

Scaffold Elata starter apps from published templates.

## What This Package Is

This package provides the `create-elata-demo` CLI and these app starters:

| Template | Aliases | What it is |
| --- | --- | --- |
| `rppg-demo` | `rppg` | Camera pulse / rPPG starter (default, no hardware) |
| `eeg-demo` | `eeg` | Browser EEG starter with Muse Web Bluetooth support |
| `eeg-ble` | `ble`, `eeg-web-ble-demo` | BLE-first EEG starter with the browser pairing flow and native reference callouts |
| `ppg-demo` | `ppg`, `muse-ppg` | Muse PPG heart rate and HRV starter |
| `pulse-game` | `pulse`, `recovery` | rPPG recovery game that runs in a sandboxed iframe and stores scores with `app-metrics` |

Legacy names `rppg-web-demo` and `eeg-web-demo` are still accepted.

Every template includes `npm run build:zip`, which writes `app.zip` with
`index.html` at the root, ready to upload to the
[Elata App Store](https://docs.elata.bio/apps/build/launch-your-app).

Use it when you want a clean scaffolded app or a consumer-facing reference project.

## When To Use It

Use `@elata-biosciences/create-elata-demo` when you want:

- the fastest path to a running Elata app
- a reference app that matches the published package surface
- a cleaner starting point than cloning or modifying the monorepo demos

## Install

This package is usually invoked without installing it permanently:

```bash
npm create @elata-biosciences/elata-demo my-app
pnpm dlx @elata-biosciences/create-elata-demo my-app
npx @elata-biosciences/create-elata-demo my-app
```

## Requirements

- Node.js `>= 18`

## Usage

List templates:

```bash
pnpm dlx @elata-biosciences/create-elata-demo --list-templates
npx @elata-biosciences/create-elata-demo --list-templates
```

Scaffold a project:

```bash
npm create @elata-biosciences/elata-demo my-app
npm create @elata-biosciences/elata-demo my-app -- --template rppg
npm create @elata-biosciences/elata-demo my-app -- --template eeg-demo
npm create @elata-biosciences/elata-demo my-app -- --template eeg
npm create @elata-biosciences/elata-demo my-app -- --template eeg-ble
npm create @elata-biosciences/elata-demo my-app -- --template ble
npm create @elata-biosciences/elata-demo my-app -- --template ppg
npm create @elata-biosciences/elata-demo my-app -- --template pulse-game
```

When you run the CLI interactively without `--template`, it first asks which app
type you want to create, then asks for the project name. In non-interactive
runs, it still falls back to the default `rppg-demo` template.

If you omit the project directory, the CLI prompts for the project name.

## Build And Dev Notes

The package is tested from the repo with:

```bash
./run.sh doctor
pnpm --dir packages/create-elata-demo test
./run.sh test create-elata-demo
```

The third command also ensures workspace dependencies exist, then smoke-tests
the `rppg-demo`, `eeg-demo`, and `eeg-ble` templates by scaffolding, installing
dependencies, and running a build.

## Workspace Caveat

If you scaffold a new app inside another `pnpm` workspace and that app is not
added to the workspace globs, run this from the parent directory:

```text
pnpm:
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev

npm:
cd my-app
npm install
npm run dev
```

## Troubleshooting

- If scaffolding fails because the directory already exists, choose a new target folder or remove the existing one first.
- If `pnpm install` inside a generated app does not create `node_modules`, check whether you are inside another `pnpm` workspace and use `--ignore-workspace`.
- If you are deciding between this package and `./run.sh sync-to`, use `create-elata-demo` for new apps and `sync-to` only for local `eeg-web` iteration against an existing app.

## More Details

For full scaffolding behavior and examples, see
[docs/create-elata-demo.md](https://github.com/Elata-Biosciences/elata-bio-sdk/blob/main/docs/create-elata-demo.md).
