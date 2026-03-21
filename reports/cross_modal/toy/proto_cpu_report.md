# Cross-Modal Toy Smoke Report

- Config: `configs\cross_modal\proto_cpu.toml`
- Manifest: `reports\cross_modal\toy\proto_cpu_manifest.json`
- Dataset: `reports\cross_modal\toy\proto_cpu_dataset.json`
- Train windows: `144`
- Eval windows: `48`
- Runtime seconds: `2.242`
- Peak memory MB: `0.213`

## EEG -> fNIRS

- Model MSE: `0.154385`
- Null MSE: `6.087261`
- Model correlation: `0.950301`

## EEG+fNIRS -> PPG Morphology

- Model MAE: `0.119439`
- Null MAE: `2.379576`
- Model correlation: `0.998153`

## Toy-Mode Contract

- Single-command report written: `reports\cross_modal\toy\proto_cpu_report.md`
- Machine-readable metrics written: `reports\cross_modal\toy\proto_cpu_metrics.json`
