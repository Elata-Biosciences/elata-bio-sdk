#!/usr/bin/env python3
"""Derive DS003838 PPG target artifacts from the Phase 2 window dataset."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
import tomllib
import tracemalloc

import numpy as np

from ppg_targets import derive_ppg_window_targets


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def target_valid_key(name: str) -> str:
    return f"{name}_valid"


def build_summary(*, config_path: Path, coverage: dict) -> str:
    train_windows = coverage["quality_pass_counts"]["train"]
    eval_windows = coverage["quality_pass_counts"]["eval"]
    lines = [
        "# DS003838 Target Derivation Summary",
        "",
        f"Config: `{str(config_path).replace(chr(92), '/')}`",
        "",
        "## Coverage",
        "",
        f"- quality-pass train windows: {train_windows}",
        f"- quality-pass eval windows: {eval_windows}",
        f"- dominant beat valid train windows: {coverage['per_target']['dominant_beat_amplitude']['train_valid']}",
        f"- dominant beat valid eval windows: {coverage['per_target']['dominant_beat_amplitude']['eval_valid']}",
        f"- notch-valid train windows: {coverage['per_target']['dominant_beat_notch_delay_seconds']['train_valid']}",
        f"- notch-valid eval windows: {coverage['per_target']['dominant_beat_notch_delay_seconds']['eval_valid']}",
        "",
        "## Notes",
        "",
        "- Beat-synchronous morphology targets are derived from the cleaned PPG branch so peak detection is stable while native morphology remains preserved in the Phase 2 artifact.",
        "- Dominant-beat targets are conservative and require a plausible preceding trough, following trough, rise time, and width.",
        "- Notch timing remains a masked diagnostic target; the current pilot split still has sparse notch-valid train coverage.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Derive DS003838 PPG target artifacts.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds003838_targets.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_path = Path(config["targets"]["dataset"])
    metadata_path = Path(config["targets"]["metadata"])
    targets_path = Path(config["paths"]["targets"])
    coverage_path = Path(config["paths"]["coverage"])
    summary_path = Path(config["paths"]["summary"])
    source_branch = config["targets"]["source_branch"]
    sfreq = float(config["targets"]["ppg_clean_sfreq_hz"])
    target_names = list(config["targets"]["target_names"])
    target_names_with_masks = target_names + [target_valid_key(name) for name in target_names]

    arrays = np.load(dataset_path)
    metadata = load_json(metadata_path)["windows"]
    ppg_windows = arrays[source_branch]

    tracemalloc.start()
    start = time.perf_counter()

    target_values: dict[str, list[float | int | bool]] = {name: [] for name in target_names_with_masks}
    per_target_counts: dict[str, dict] = {
        name: {
            "total_valid": 0,
            "train_valid": 0,
            "eval_valid": 0,
            "by_subject": {},
        }
        for name in target_names
    }
    quality_pass_counts = {"train": 0, "eval": 0}

    for window_index, (signal, row) in enumerate(zip(ppg_windows, metadata)):
        derived = derive_ppg_window_targets(
            signal.astype(np.float64),
            sfreq=sfreq,
            min_peak_distance_seconds=float(config["targets"]["ppg_peak_min_distance_seconds"]),
            peak_threshold_std=float(config["targets"]["ppg_peak_threshold_std"]),
            dominant_beat_min_rise_seconds=float(config["targets"]["dominant_beat_min_rise_seconds"]),
            dominant_beat_max_rise_seconds=float(config["targets"]["dominant_beat_max_rise_seconds"]),
            dominant_beat_min_width_seconds=float(config["targets"]["dominant_beat_min_width_seconds"]),
            dominant_beat_max_width_seconds=float(config["targets"]["dominant_beat_max_width_seconds"]),
            notch_min_delay_seconds=float(config["targets"]["notch_min_delay_seconds"]),
            notch_max_delay_seconds=float(config["targets"]["notch_max_delay_seconds"]),
            notch_min_rebound_fraction=float(config["targets"]["notch_min_rebound_fraction"]),
        )

        split = row["split"]
        quality_pass = bool(row["quality_flags"]["window_quality_pass"])
        if quality_pass:
            quality_pass_counts[split] += 1

        derived["window_quality_pass"] = quality_pass
        derived["window_index"] = window_index

        for name in target_names:
            if name == "dominant_beat_notch_delay_seconds":
                valid = bool(derived["dominant_beat_notch_valid"])
            elif name.startswith("dominant_beat_"):
                valid = bool(derived["dominant_beat_valid"])
            else:
                valid = True

            target_values[name].append(float(derived[name]))
            target_values[target_valid_key(name)].append(bool(valid))

            if not quality_pass or not valid:
                continue
            counts = per_target_counts[name]
            counts["total_valid"] += 1
            counts[f"{split}_valid"] += 1
            subject_counts = counts["by_subject"].setdefault(
                row["subject_id"],
                {
                    "split": split,
                    "valid": 0,
                },
            )
            subject_counts["valid"] += 1

    runtime_sec = time.perf_counter() - start
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    total_windows = len(metadata)
    coverage = {
        "kind": "ds003838_target_coverage",
        "config_path": str(config_path).replace("\\", "/"),
        "runtime_sec": runtime_sec,
        "peak_memory_mb": peak_memory_bytes / (1024 * 1024),
        "source_dataset": str(dataset_path).replace("\\", "/"),
        "source_branch": source_branch,
        "window_count": total_windows,
        "quality_pass_counts": quality_pass_counts,
        "target_names": target_names,
        "per_target": {},
    }

    for name in target_names:
        counts = per_target_counts[name]
        coverage["per_target"][name] = {
            "total_valid": counts["total_valid"],
            "train_valid": counts["train_valid"],
            "eval_valid": counts["eval_valid"],
            "train_valid_fraction": counts["train_valid"] / max(quality_pass_counts["train"], 1),
            "eval_valid_fraction": counts["eval_valid"] / max(quality_pass_counts["eval"], 1),
            "by_subject": counts["by_subject"],
        }

    for path in [targets_path, coverage_path, summary_path]:
        ensure_parent(path)
    np.savez_compressed(
        targets_path,
        **{
            name: np.asarray(values, dtype=np.float32 if not name.endswith("_valid") else np.bool_)
            for name, values in target_values.items()
        },
    )
    coverage_path.write_text(json.dumps(coverage, indent=2), encoding="utf-8")
    summary_path.write_text(build_summary(config_path=config_path, coverage=coverage), encoding="utf-8")

    print(f"Wrote target arrays to {targets_path}")
    print(f"Wrote target coverage to {coverage_path}")
    print(f"Wrote target summary to {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
