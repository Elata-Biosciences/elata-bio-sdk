## Contributing to Elata SDK

Thank you for your interest in contributing! This document describes how to get
set up, propose changes, and work with the maintainers.

### Getting Started

- **Prerequisites**
  - Node.js >= 18
  - Rust toolchain (via `rustup`)
  - `pnpm` (preferred) or `npm` for JS tooling

- **Initial setup**

```bash
git clone https://github.com/elata-bio/elata-sdk.git
cd elata-sdk
./run.sh doctor      # validates toolchain, dependencies, and package artifacts
```

See `README.md` for details on building Rust crates and web packages.

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
   - Web packages: `pnpm test` (or `npm test`) in the relevant `packages/*` directory.
5. **Run checks**
   - Prefer `./run.sh` or documented scripts from `README.md` where available.
6. **Open a pull request**
   - Reference associated issues.
   - Summarize what changed and why.

### Coding Guidelines

- Prefer **small, composable modules** and clear interfaces.
- Avoid unnecessary breaking changes to public crates and npm packages.
- Keep public APIs well-documented and stable when possible.

### Communication

- Use GitHub issues and PRs for technical discussion.
- Be respectful and follow the project’s `CODE_OF_CONDUCT.md`.

### License

By contributing, you agree that your contributions will be licensed under the
MIT License, the same as this repository.
