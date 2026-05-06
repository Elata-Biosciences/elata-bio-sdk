# Docs Index

Use this page to find the right document quickly.

## `docs/` vs `elata-docs/`

These are **not** meant to be identical copies.

| Location | Role |
| -------- | ---- |
| **[`elata-docs/`](../elata-docs/)** | Public documentation site (Mintlify, MDX). Consumer-facing guides, tutorials, and product pages for **docs.elata.bio**. May track a separate git remote or submodule. |
| **`docs/`** (this tree) | **Repo-local** Markdown: maintainer workflows, `run.sh` alignment, releasing, planning notes, and **plain-Markdown** consumer guides that render well on GitHub and in the workspace. |

**Keeping them aligned:** When you change SDK behavior, package APIs, or onboarding flows, update **package READMEs** first, then **both** any affected `docs/guides/*.md` here **and** the corresponding `elata-docs/sdk/**/*.mdx` (or other routes) on the docs site. The site uses MDX components (`CodeGroup`, frontmatter, etc.), so you typically **port facts and sections**, not raw file copies.

Small **SDK reference** pages under `elata-docs/reference/` have been tracked with hashes in [`elata-docs/.sdk-sync-state`](../elata-docs/.sdk-sync-state) when syncing with this repo; treat that file as optional bookkeeping, not automatic CI.

If `elata-docs` has newer wording than `docs/guides/`, prefer **bringing the accurate facts into `docs/guides/`** so contributors who only open the monorepo still see current guidance.

## AI-assisted coding

Agents and humans using automation should start with **[guides/ai-assisted-development.md](guides/ai-assisted-development.md)** for a full routing table (scaffold vs existing app vs **vendor headset** work, `docs/` vs `elata-docs/` vs package `README`/`llms.txt`). [AGENTS.md](../AGENTS.md) remains the repo playbook; the guide links it with tutorials and checklists.

## Operational Docs

- [../elata-docs/README.md](../elata-docs/README.md): Mintlify docs-site tree for `docs.elata.bio`
- [create-elata-demo.md](create-elata-demo.md): scaffold a new app from published templates
- [dev_setup.md](dev_setup.md): local development setup and faster iteration tips
- [repo-map.md](repo-map.md): repo layout, package ownership, and canonical workflows

## Consumer Guides

- [guides/README.md](guides/README.md): guide index for SDK consumers
- [guides/getting-started.md](guides/getting-started.md): fastest path to a running app
- [guides/example-apps.md](guides/example-apps.md): open source apps using the SDK on GitHub Pages
- [guides/choose-the-right-package.md](guides/choose-the-right-package.md): package decision guide
- [guides/using-eeg-in-a-browser-app.md](guides/using-eeg-in-a-browser-app.md): browser EEG integration guide
- [guides/using-web-bluetooth-with-supported-devices.md](guides/using-web-bluetooth-with-supported-devices.md): Web Bluetooth headset flow (built-in Muse; extensible)
- [guides/using-rppg-in-a-browser-app.md](guides/using-rppg-in-a-browser-app.md): browser rPPG integration guide
- [guides/compatibility.md](guides/compatibility.md): browser, device, and tooling expectations
- [guides/troubleshooting.md](guides/troubleshooting.md): common failures and fixes

## SDK Adoption Tracking

- [sdk-adoption-baseline.md](sdk-adoption-baseline.md): current onboarding baseline and friction summary
- [sdk-adoption-issues.md](sdk-adoption-issues.md): grouped issue list for the remaining DX work

## Maintainers

- [maintainers.md](maintainers.md): maintainer-focused operational guide
- [releasing.md](releasing.md): release, tagging, and bad-release recovery
- [contributing-eeg-transports.md](contributing-eeg-transports.md): adding headset transports beyond the built-in Muse path
- [vendor-headset-onboarding-checklist.md](vendor-headset-onboarding-checklist.md): step-by-step vendor onboarding checklist

## Architecture

- [architecture-rppg.md](architecture-rppg.md)
- [architecture-sentiment.md](architecture-sentiment.md)

## Planning And Historical Reference

These files mix **completed work**, **roadmaps**, and **exploratory** ideas. Each plan’s top **Status** line is kept roughly aligned with the repo; still verify commands and paths in code before acting.

| Doc | Role |
| --- | --- |
| [implementation-plan-demo-scaffolding.md](implementation-plan-demo-scaffolding.md) | Historical; scaffolder is live (`rppg-demo` / `eeg-demo` / `eeg-ble`). `inject` not built. |
| [implementation-plan-sdk-adoption.md](implementation-plan-sdk-adoption.md) | Adoption checklist—most phases checked off; guides are primary follow-up. |
| [implementation-plan-rppg.md](implementation-plan-rppg.md) | rPPG crate + `rppg-web` evolution; consumers use `createRppgSession()`. |
| [rppg-multi-roi-learned-reconstruction.md](rppg-multi-roi-learned-reconstruction.md) | Detailed rPPG Phase 4.5/4.6 design note: multi-ROI Rust/WASM waveform construction and distilled learned reconstruction. |
| [implementation-plan-rppg-tradelock-imports.md](implementation-plan-rppg-tradelock-imports.md) | Diagnostics/tracker import track—Phase 1 done; one Phase 2 open item. |
| [implementation-plan-harmonic-selection.md](implementation-plan-harmonic-selection.md) | Algorithm roadmap; parts implemented in `crates/elata-rppg` (see file for details). |
| [implementation-plan-ios-safari-ble-bridge.md](implementation-plan-ios-safari-ble-bridge.md) | Future native bridge; not a statement of current browser support. |
| [implementation-plan-sentiment.md](implementation-plan-sentiment.md) | Sentiment plan; overlaps **`crates/elata-facial-affect`** + [architecture-sentiment.md](architecture-sentiment.md). |
| [implementation-plan-multi-modality-and-rppg.md](implementation-plan-multi-modality-and-rppg.md) | Draft architecture for multi-device aggregation (not fully implemented). |

## Related Repo Guides

- [README.md](../README.md): repo entry point
- [CONTRIBUTING.md](../CONTRIBUTING.md): contributor guidance
- [AGENTS.md](../AGENTS.md): AI agent playbook
