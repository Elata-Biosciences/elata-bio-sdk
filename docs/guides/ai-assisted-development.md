# AI-assisted development (agents and automation)

Use this page when you are coding with **AI tools** (IDE agents, CLI assistants, or automation) and need a **single map** of what to read in this repo versus the **`elata-docs/`** Mintlify tree (public site) and **package** sources.

## Read first (monorepo)

| Order | File | Why |
| ----- | ---- | --- |
| 1 | [AGENTS.md](../../AGENTS.md) | Playbook for this repo: canonical commands, wrong-path prevention, verification. |
| 2 | [README.md](../../README.md) | Package list, scaffold commands, workspace caveats. |
| 3 | [CONTRIBUTING.md](../../CONTRIBUTING.md) | How to run tests and land changes. |
| 4 | [run.sh](../../run.sh) (or [dev_setup.md](../dev_setup.md)) | Actual `doctor`, `build`, `test`, `demo` behavior—prefer over guesswork. |

Then branch by task using the tables below.

## Package truth (npm consumers)

Each published package ships **`README.md`** and **`llms.txt`** in the npm tarball. In a clone, they live at:

- `packages/eeg-web/README.md`, `packages/eeg-web/llms.txt`
- `packages/eeg-web-ble/README.md`, `packages/eeg-web-ble/llms.txt`
- `packages/rppg-web/README.md`, `packages/rppg-web/llms.txt`
- `packages/create-elata-demo/README.md`, `packages/create-elata-demo/llms.txt`

Treat **package README + `llms.txt` + `package.json` (`exports`, `peerDependencies`)** as the integration contract. Deep API detail is also in **`dist/*.d.ts`** after a build.

## Task → where to look

### New app or first integration

| Need | In `docs/` | In `elata-docs/` (richer tutorials, MDX) |
| ---- | ----------- | ---------------------------------------- |
| Scaffold CLI, templates, pnpm workspace caveat | [create-elata-demo.md](../create-elata-demo.md) | `sdk/create-elata-demo.mdx` |
| Fastest “what do I run?” | [getting-started.md](getting-started.md) | `sdk/overview.mdx`, `quickstart.mdx` |
| Pick packages | [choose-the-right-package.md](choose-the-right-package.md) | `sdk/guides/choose-the-right-package.mdx` |

### Existing browser app (integrate SDK into code you already have)

| Track | `docs/` | `elata-docs/` |
| ----- | ------- | ------------- |
| EEG WASM / processing | [using-eeg-in-a-browser-app.md](using-eeg-in-a-browser-app.md) | `sdk/eeg-web/getting-started.mdx`, `sdk/guides/eeg-browser.mdx`, `sdk/tutorials/eeg-existing-app.mdx` |
| Web Bluetooth + Muse | [using-web-bluetooth-with-supported-devices.md](using-web-bluetooth-with-supported-devices.md) | `sdk/eeg-web-ble/getting-started.mdx`, `sdk/guides/eeg-ble-integration.mdx`, `sdk/tutorials/eeg-ble-live-stream.mdx` |
| rPPG / camera | [using-rppg-in-a-browser-app.md](using-rppg-in-a-browser-app.md) | `sdk/rppg-web/getting-started.mdx`, `sdk/guides/rppg-browser.mdx`, `sdk/guides/rppg-camera.mdx`, `sdk/tutorials/rppg-existing-app.mdx` |
| Headband contract / transport | [contributing-eeg-transports.md](../contributing-eeg-transports.md) (contributor-focused) | `sdk/eeg-web/headband-transport.mdx` |

### Vendors and headset integrators

| Topic | Canonical in repo | On docs site |
| ----- | ------------------ | ------------ |
| Checklist and GATT expectations | [vendor-headset-onboarding-checklist.md](../vendor-headset-onboarding-checklist.md) | `sdk/maintainers/vendor-headset-onboarding.mdx` (links back to repo) |
| Transport contribution rules | [contributing-eeg-transports.md](../contributing-eeg-transports.md) | `sdk/maintainers/contributing-eeg-transports.mdx` |
| Packaging choice (upstream vs separate package vs app-local) | — | `integration-paths.mdx` (root of `elata-docs/`) |

Agents should implement against **`HeadbandTransport` + `HeadbandFrameV1`** from `@elata-biosciences/eeg-web` and follow the checklist; use **`BleDeviceLike`** and `BleTransport({ device })` when adding a non-Muse device module.

### Repo maintainers (release, CI, structure)

| Topic | Location |
| ----- | -------- |
| Release and Changesets | [releasing.md](../releasing.md), `elata-docs/sdk/maintainers/releasing.mdx` |
| Repo layout | [repo-map.md](../repo-map.md), `elata-docs/sdk/maintainers/repo-workflows.mdx` |
| Troubleshooting consumer issues | [troubleshooting.md](troubleshooting.md), `elata-docs/sdk/operations/troubleshooting.mdx` |
| Compatibility matrix | [compatibility.md](compatibility.md), `elata-docs/sdk/operations/compatibility.mdx` |

## `docs/` vs `elata-docs/`: how to use both

- **`docs/`** (this tree): Markdown, works in GitHub and offline clones; **maintainer workflows**, exact paths, and consumer guides without Mintlify-only components.
- **`elata-docs/`**: **Tutorials**, step-by-step walkthroughs, diagrams, and product-adjacent pages for **docs.elata.bio**. Same facts should agree with `docs/` and package READMEs; site pages are often **more verbose** and **tutorial-first**.

If a tutorial exists only under `elata-docs/sdk/tutorials/`, agents should still follow **AGENTS.md** and **package READMEs** for commands and APIs—the tutorial is the narrative; the repo is the contract.

## Verification before you claim “done”

Use the **narrowest** check that matches the change (from [AGENTS.md](../../AGENTS.md)):

- Package or scaffolding: `./run.sh test` or targeted `pnpm --dir packages/<pkg> test`
- Broader release-sensitive edits: `./run.sh verify-all` when feasible

## Historical or exploratory docs

Under `docs/`, files named `implementation-plan-*.md` are **planning or historical** unless they clearly match current code. Prefer `run.sh`, package scripts, and the guides above for operational truth.
