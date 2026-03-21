# Phase 0 Toy-Mode Execution Checklist

Status: Active

## Purpose

Toy mode exists to keep iteration fast. This checklist defines the contract for any experiment path that claims to support local execution.

## Hardware budget

- [ ] runs on a laptop CPU or personal workstation
- [ ] does not require distributed training
- [ ] documents expected peak memory use
- [ ] documents expected runtime

## Dataset budget

- [ ] uses a tiny subset built by a reproducible subset script
- [ ] writes a lightweight manifest that records split and coverage metadata
- [ ] subset size is recorded
- [ ] subject and session composition is recorded
- [ ] labels or metadata omitted in toy mode are documented

## Command contract

- [ ] one command builds the toy subset
- [ ] one command runs training
- [ ] one command runs evaluation
- [ ] one command validates the resulting artifacts
- [ ] commands work without manual file editing

## Output contract

- [ ] writes a compact Markdown or HTML report
- [ ] writes a machine-readable metric summary
- [ ] writes a machine-readable manifest summary
- [ ] writes runtime and memory measurements
- [ ] records the config used

## Acceptance criteria

- [ ] end-to-end run finishes in a short feedback loop
- [ ] failure modes are understandable from the report
- [ ] output is good enough to compare two model or preprocessing variants
- [ ] no hidden dependency on the full data stack remains

## Toy-mode failure reasons

Record failure here when a phase cannot yet support toy mode.

- [ ] missing subset builder
- [ ] missing local config
- [ ] runtime too slow
- [ ] memory too high
- [ ] output not comparable
- [ ] hidden infrastructure dependency
