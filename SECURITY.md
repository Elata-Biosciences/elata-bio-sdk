## Security Policy

**Reporting a Vulnerability**

- Please email security reports to `security@elata.bio` (or your usual Elata contact if you are under NDA).
- If email is not possible, use GitHub's private vulnerability reporting ("Report a vulnerability" / Security Advisory) instead of a public issue.
- Include:
  - A clear description of the issue and potential impact.
  - Reproduction steps, logs, and any proof-of-concept code.
  - Affected versions / commit SHA if known.

We aim to acknowledge new reports within **5 business days** and will keep you updated on:

- Triage outcome.
- Planned fix or mitigation.
- Expected disclosure timeline (we prefer coordinated disclosure when possible).

**Scope**

This policy covers all code in the `elata-sdk` repository, including:

- Rust crates under `crates/`
- Web packages under `packages/`
- Demo and example applications in this repo

**Non-Goals**

- This repo does **not** operate a bug bounty program.
- Availability issues of your own deployments are out of scope, unless they stem from a reproducible vulnerability in this codebase.
