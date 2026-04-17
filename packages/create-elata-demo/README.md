# @elata-biosciences/create-elata-demo

Scaffold Elata starter apps from published templates.

## What This Package Is

This package provides the `create-elata-demo` CLI and these user-facing app starters:

- `rppg-demo`
- `eeg-demo`
- `eeg-ble`

Short aliases and compatibility names are also supported:

- `rppg`
- `eeg`
- `ble`
- `eeg-web-ble-demo`

`eeg-ble` is a separate BLE-first starter with browser pairing flow and native
reference callouts for the iOS and Android demo surfaces.

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
pnpm dlx @elata-biosciences/create-elata-demo -- --list-templates
npx @elata-biosciences/create-elata-demo -- --list-templates
```

Scaffold a project:

```bash
npm create @elata-biosciences/elata-demo my-app
npm create @elata-biosciences/elata-demo my-app -- --template rppg
npm create @elata-biosciences/elata-demo my-app -- --template eeg-demo
npm create @elata-biosciences/elata-demo my-app -- --template eeg
npm create @elata-biosciences/elata-demo my-app -- --template eeg-ble
npm create @elata-biosciences/elata-demo my-app -- --template ble
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
each template by scaffolding, installing dependencies, and running a build.

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
