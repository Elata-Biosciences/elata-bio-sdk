# crates/elata-muse-proto

Muse-compatible BLE protocol constants and packet utilities for EEG headset
integrations.

## What it provides

- BLE service and characteristic UUID constants
- packet parsing/encoding helpers for classic and Athena flows
- shared protocol primitives used by higher-level transport layers

## Typical use

Use this crate when implementing or extending Muse-compatible transport code in
Rust.
