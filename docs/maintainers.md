# Maintainer Guide

This page collects the maintainer-facing workflows that are easy to lose track
of when they are scattered across the root README, package docs, and release
scripts.

## Primary Maintainer Commands

Use `run.sh` from the repo root:

```bash
./run.sh doctor
./run.sh test
./run.sh verify-all
./run.sh bump
./run.sh release-check all
./run.sh release all next
```

## What To Use For Common Jobs

- New demo app flow: `create-elata-demo`
- Consumer-facing package docs: package `README.md` files
- SDK-level build/test/release orchestration: `run.sh`
- Release policy and recovery: `docs/releasing.md`
- Repo/package ownership questions: `docs/repo-map.md`

## Changesets

This repo uses Changesets for package versioning and changelog generation.

Contributor expectation:

- if a user-facing package change should ship, include a changeset

Maintainer flow:

1. Run `./run.sh bump`
2. Review the version and changelog diff
3. Commit the generated changes
4. Run `./run.sh release-check all`
5. Publish with `./run.sh release all next` or `latest`

## Release Scope

Published packages currently include:

- `@elata-biosciences/eeg-web`
- `@elata-biosciences/eeg-web-ble`
- `@elata-biosciences/rppg-web`
- `@elata-biosciences/create-elata-demo`

Before changing release docs, verify the package set against current
`packages/*/package.json` files and root `package.json` verification scripts.

## Verification Rules Of Thumb

- Package README changes: confirm referenced commands still exist
- Scaffolder changes: run `./run.sh test create-elata-demo`
- `run.sh` changes: run the narrowest affected command and prefer broader checks if release paths are touched
- Release-tooling changes: run `./run.sh verify-all` if feasible
- Docs that mention onboarding: verify `create-elata-demo` guidance and workspace caveats

## Workspace Caveat

If you scaffold a demo inside this repo, plain `pnpm install` in the generated
app can attach to the parent workspace from `pnpm-workspace.yaml`.

Use:

```bash
pnpm --dir my-app --ignore-workspace install
pnpm --dir my-app --ignore-workspace run dev
```

or use `npm` inside the generated app.

## Backward Compatibility Notes

- `scripts/dev-link.sh` is intentionally kept as a thin wrapper around `run.sh sync-to`
- `sync-to` remains useful for local `packages/eeg-web` development, but it is not the recommended user onboarding flow
- consumer onboarding should point to `create-elata-demo`, not to `sync-to`

## Documentation Ownership

- Root `README.md`: entry-point and high-level navigation
- `docs/create-elata-demo.md`: scaffolding behavior and caveats
- `docs/releasing.md`: release mechanics and recovery
- package READMEs: package-specific install and usage
- `AGENTS.md`: repo interrogation and AI-agent workflow
- `docs/implementation-plan-*.md`: planning and historical reference, not the default source of truth for current workflows
