## Contributing to Elata SDK

Thank you for your interest in contributing! This document describes how to get
set up, propose changes, and work with the maintainers.

### Getting Started

- **Prerequisites**
  - Node.js >= 20
  - Rust toolchain (via `rustup`)
  - `pnpm` for JS tooling

- **Initial setup**

```bash
git clone https://github.com/Elata-Biosciences/elata-bio-sdk.git
cd elata-bio-sdk
./run.sh doctor      # validates toolchain, dependencies, and package artifacts
```

See `README.md` for details on building Rust crates and web packages.
See `docs/README.md` for the broader docs map, and `AGENTS.md` for the
repo-specific AI agent playbook.

If your change touches demo scaffolding, also read `docs/create-elata-demo.md`
and `packages/create-elata-demo/README.md` so the code, contributor docs, and
consumer docs stay aligned.

If your change touches in-repo demos or example code, also check
`docs/dev_setup.md`, `docs/repo-map.md`, and the nearest package README so the
repo-development path stays clearly separated from the consumer scaffolding
path.

### How to Propose Changes

1. **Open an issue** (recommended)
   - Describe the problem, proposal, or feature.
   - Include any relevant logs, screenshots, or minimal reproductions.
2. **Fork and branch**
   - Create a feature branch from `main`.
3. **Make your changes**
   - Keep changes focused and reasonably small.
   - Follow existing code style and patterns.
4. **Add tests where appropriate**
   - Rust: `cargo test`
   - Web packages: `pnpm test` in the relevant `packages/*` directory.
   - Scaffolder changes: `./run.sh test create-elata-demo`
   - Demo workflow changes: run the narrowest affected `./run.sh demo ...`
     flow or package build that proves the docs still match reality.
5. **Run checks**
   - Prefer `./run.sh` or documented scripts from `README.md` where available.
   - If you changed `elata-docs`, run `pnpm docs:mintlify:check` (or `pnpm docs:check`).
   - If you changed scaffold commands or template behavior, update `README.md`,
     `docs/create-elata-demo.md`, and nearby contributor docs in the same task
     when practical.
6. **Add a changeset** (if your change should be included in a release):
   - Run `./run.sh changeset` (or `pnpm changeset`) and follow the prompts.
   - Commit the new file under `.changeset/` with your PR.
7. **Open a pull request**
   - Reference associated issues.
   - Summarize what changed and why.

### EEG headset transports (Web Bluetooth and beyond)

If you are adding or changing how a **headset** delivers data to the browser EEG
stack, read [docs/contributing-eeg-transports.md](docs/contributing-eeg-transports.md)
first. New hardware should converge on **`HeadbandTransport`** /
**`HeadbandFrameV1`** from `@elata-biosciences/eeg-web`. Prefer extending
`packages/eeg-web-ble` or adding a focused sibling package under `packages/`
rather than forking consumer demos.

### Coding Guidelines

- Prefer **small, composable modules** and clear interfaces.
- Avoid unnecessary breaking changes to public crates and npm packages.
- Keep public APIs well-documented and stable when possible.

### Scaffolding Notes

- The canonical new-app path is `@elata-biosciences/create-elata-demo`.
- `npm create @elata-biosciences/elata-demo` and direct `create-elata-demo`
  invocations should stay documented together when behavior changes.
- The current scaffold flow supports interactive template selection, template
  aliases (`rppg`, `eeg`, `ble`; plus legacy `eeg-web-ble-demo`), and
  `--list-templates`.
- If you scaffold inside another `pnpm` workspace, verify the
  `pnpm --dir my-app --ignore-workspace ...` caveat before treating it as a
  scaffold failure.

### Demo And Example Notes

- `./run.sh demo eeg|rppg|hal` is for SDK development and manual repo
  validation, not the default consumer onboarding flow.
- `eeg-demo/`, `packages/rppg-web/demo/`, `ios-demo/`, and `android-demo/` are
  reference or SDK-development surfaces.
- When docs mention both scaffolded apps and in-repo demos, lead with the
  recommended default first and clearly label the repo-demo path as internal or
  maintainer-oriented.

### Communication

- Use GitHub issues and PRs for technical discussion.
- Be respectful and follow the project’s `CODE_OF_CONDUCT.md`.

### License

By contributing, you agree that your contributions will be licensed under the
MIT License, the same as this repository.
