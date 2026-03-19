# Elata SDK Docs Site

This directory is a Mintlify docs project intended to become the basis of the
next `docs.elata.bio` developer site.

## Why It Exists

- matches the current `docs.elata.bio` visual direction by using the Mint theme
- reorganizes the repo's existing markdown into a developer-first docs flow
- keeps the site in a dedicated monorepo directory so Mintlify can deploy it as
  a monorepo subpath without looking like the primary in-repo docs source for SDK users

## Local Preview

From this directory:

```bash
npx mint dev
```

Or from the repo root:

```bash
./run.sh docs
./run.sh docs open
```

Mintlify looks for `docs.json` in the current directory, so run the CLI from
`internal/docs-site/`.

The Mintlify CLI currently expects an LTS Node.js release. In this workspace,
`mint dev` rejected Node `v25.2.1`, so use Node 20 or 22 locally when previewing
the site.

`./run.sh docs` already prefers Volta with Node `22.22.1` when Volta is
available, so it is the easiest local preview path in this repo.

## Deployment Shape

When this is wired into Mintlify as a monorepo deployment, point the docs root
at:

```text
internal/docs-site/
```

## Content Sources

This first pass is based on the current repo docs and package READMEs, plus
public protocol context that SDK and ecosystem developers need:

- `README.md`
- `docs/guides/*`
- `docs/create-elata-demo.md`
- `docs/maintainers.md`
- `docs/releasing.md`
- `packages/*/README.md`
- `https://www.npmjs.com/package/@elata-biosciences/*` as the public package
  landing surface developers should see first
- `../elata-protocol/{README.md,QUICKSTART.md,docs/*,sim/README.md}` for
  app-launch, contract, local-chain, XP, and simulation context that SDK
  developers need
