#!/usr/bin/env python3
"""Build a small synthetic cross-modal dataset for local toy-mode experiments.

This intentionally avoids non-stdlib dependencies so a researcher can run
the first end-to-end loop on a stock Python installation.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
import tomllib

from manifest_contract import MANIFEST_KIND, SCHEMA_VERSION, normalize_dataset_path, validate_manifest


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def generate_dataset(config: dict) -> dict:
    seed = int(config["toy_subset"]["seed"])
    rng = random.Random(seed)

    subject_count = int(config["toy_subset"]["subject_count"])
    sessions_per_subject = int(config["toy_subset"]["sessions_per_subject"])
    windows_per_session = int(config["toy_subset"]["windows_per_session"])
    latent_dim = int(config["toy_subset"]["latent_dim"])
    eeg_dim = int(config["toy_subset"]["eeg_dim"])
    fnirs_dim = int(config["toy_subset"]["fnirs_dim"])
    ppg_dim = int(config["toy_subset"]["ppg_dim"])
    heldout_subjects = int(config["toy_subset"]["heldout_subjects"])

    protocols = list(config["toy_subset"]["protocols"])
    quality_floor = float(config["toy_subset"]["quality_floor"])
    noise_scale = float(config["toy_subset"]["noise_scale"])

    eeg_weights = [
        [rng.uniform(-1.0, 1.0) for _ in range(latent_dim + 1)] for _ in range(eeg_dim)
    ]
    fnirs_weights = [
        [rng.uniform(-0.8, 0.8) for _ in range(latent_dim + 1)] for _ in range(fnirs_dim)
    ]
    ppg_weights = [
        [rng.uniform(-0.6, 0.6) for _ in range(latent_dim + 1 + fnirs_dim)] for _ in range(ppg_dim)
    ]

    windows: list[dict] = []
    subject_ids = [f"sub-{idx + 1:02d}" for idx in range(subject_count)]
    heldout = set(subject_ids[-heldout_subjects:])

    for subject_index, subject_id in enumerate(subject_ids):
        subject_shift = [rng.uniform(-0.5, 0.5) for _ in range(latent_dim)]
        stiffness = 0.9 + 0.08 * subject_index
        age_band = "young" if subject_index < max(1, subject_count // 2) else "older"

        for session_index in range(sessions_per_subject):
            session_id = f"{subject_id}-ses-{session_index + 1:02d}"
            session_shift = [rng.uniform(-0.3, 0.3) for _ in range(latent_dim)]
            previous_latent = [rng.uniform(-0.5, 0.5) for _ in range(latent_dim)]
            previous_previous_latent = list(previous_latent)
            previous_fnirs = [0.0 for _ in range(fnirs_dim)]

            for window_index in range(windows_per_session):
                protocol = protocols[(window_index + session_index) % len(protocols)]
                event_flag = 1.0 if rng.random() < 0.18 else 0.0
                protocol_boost = 0.25 if protocol in {"working_memory", "mental_arithmetic"} else 0.0

                latent = []
                for dim in range(latent_dim):
                    drift = 0.72 * previous_latent[dim] + 0.18 * previous_previous_latent[dim]
                    event_term = event_flag * (0.5 if dim == 0 else 0.2)
                    latent_value = (
                        drift
                        + subject_shift[dim]
                        + session_shift[dim]
                        + protocol_boost
                        + event_term
                        + rng.gauss(0.0, 0.15)
                    )
                    latent.append(latent_value)

                eeg_source = latent + [event_flag]
                eeg = [
                    dot(weight_row, eeg_source) + rng.gauss(0.0, noise_scale)
                    for weight_row in eeg_weights
                ]

                fnirs = []
                delayed_source = previous_latent + [event_flag]
                for dim, weight_row in enumerate(fnirs_weights):
                    base = dot(weight_row, delayed_source)
                    smoothed = 0.65 * previous_fnirs[dim] + 0.35 * base
                    fnirs.append(smoothed + rng.gauss(0.0, noise_scale * 0.6))

                ppg_source = latent + [event_flag] + fnirs
                ppg = []
                for dim, weight_row in enumerate(ppg_weights):
                    morphology = dot(weight_row, ppg_source)
                    if dim == 0:
                        morphology += 0.12 * stiffness
                    if dim == 1:
                        morphology -= 0.08 * stiffness
                    ppg.append(morphology + rng.gauss(0.0, noise_scale * 0.7))

                quality = max(quality_floor, 1.0 - abs(rng.gauss(0.0, 0.12)))
                artifact_score = max(0.0, 1.0 - quality + rng.uniform(0.0, 0.08))
                shift = {
                    "age_band": age_band,
                    "recent_caffeine": bool((session_index + subject_index) % 2),
                    "recent_exercise": bool((window_index + session_index) % 5 == 0),
                    "artifact_burden": "high" if artifact_score > 0.35 else "low",
                }

                windows.append(
                    {
                        "subject_id": subject_id,
                        "session_id": session_id,
                        "window_index": window_index,
                        "protocol": protocol,
                        "split": "eval" if subject_id in heldout else "train",
                        "quality_score": round(quality, 4),
                        "artifact_score": round(artifact_score, 4),
                        "event_flag": int(event_flag),
                        "shift": shift,
                        "eeg_features": [round(v, 6) for v in eeg],
                        "fnirs_targets": [round(v, 6) for v in fnirs],
                        "ppg_morphology_targets": [round(v, 6) for v in ppg],
                    }
                )

                previous_previous_latent = previous_latent
                previous_latent = latent
                previous_fnirs = fnirs

    return {
        "metadata": {
            "kind": "synthetic_cross_modal_toy_subset",
            "schema_version": "0.1",
            "seed": seed,
            "subject_count": subject_count,
            "sessions_per_subject": sessions_per_subject,
            "windows_per_session": windows_per_session,
            "latent_dim": latent_dim,
            "eeg_dim": eeg_dim,
            "fnirs_dim": fnirs_dim,
            "ppg_dim": ppg_dim,
            "heldout_subjects": sorted(heldout),
            "protocols": protocols,
        },
        "windows": windows,
    }


def build_manifest(config_path: Path, dataset_path: Path, dataset: dict) -> dict:
    windows = dataset["windows"]
    train_windows = [window for window in windows if window["split"] == "train"]
    eval_windows = [window for window in windows if window["split"] == "eval"]
    subject_ids = sorted({window["subject_id"] for window in windows})
    session_ids = sorted({window["session_id"] for window in windows})
    protocols = sorted({window["protocol"] for window in windows})

    manifest = {
        "kind": MANIFEST_KIND,
        "schema_version": SCHEMA_VERSION,
        "identity": {
            "dataset_name": "synthetic-cross-modal-toy-subset",
            "dataset_version": "0.1.0",
            "source_type": "synthetic",
            "intake_status": "ready",
            "source_uri": str(config_path).replace("\\", "/"),
            "license": "internal-dev-only",
        },
        "storage": {
            "dataset_path": normalize_dataset_path(dataset_path),
            "manifest_path": "",
        },
        "generation": {
            "config_path": str(config_path).replace("\\", "/"),
            "seed": dataset["metadata"]["seed"],
        },
        "split_summary": {
            "train_windows": len(train_windows),
            "eval_windows": len(eval_windows),
            "heldout_subjects": dataset["metadata"]["heldout_subjects"],
        },
        "coverage": {
            "subject_ids": subject_ids,
            "session_ids": session_ids,
            "protocols": protocols,
            "shift_metadata_keys": ["age_band", "recent_caffeine", "recent_exercise", "artifact_burden"],
        },
        "modalities": {
            "eeg": {
                "present": True,
                "feature_dim": dataset["metadata"]["eeg_dim"],
                "sampling_rate_hz": None,
                "geometry_available": False,
            },
            "fnirs": {
                "present": True,
                "feature_dim": dataset["metadata"]["fnirs_dim"],
                "sampling_rate_hz": None,
                "geometry_available": False,
            },
            "ppg": {
                "present": True,
                "feature_dim": dataset["metadata"]["ppg_dim"],
                "sampling_rate_hz": None,
                "geometry_available": False,
            },
        },
        "labels": {
            "event_labels_present": True,
            "ppg_morphology_targets_present": True,
            "task_labels_present": True,
        },
        "quality": {
            "quality_fields": ["quality_score"],
            "artifact_fields": ["artifact_score"],
        },
        "notes": [
            "Synthetic toy subset for local smoke tests only.",
            "Not representative of Athena preprocessing or real signal statistics.",
        ],
    }
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a synthetic toy subset for local smoke tests.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/proto_cpu.toml",
        help="Path to the TOML config file.",
    )
    parser.add_argument(
        "--output",
        help="Optional override for the output dataset path.",
    )
    parser.add_argument(
        "--manifest",
        help="Optional override for the output manifest path.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    output_path = Path(args.output or config["paths"]["toy_dataset"])
    manifest_path = Path(args.manifest or config["paths"]["toy_manifest"])
    ensure_parent(output_path)
    ensure_parent(manifest_path)

    dataset = generate_dataset(config)
    manifest = build_manifest(config_path=config_path, dataset_path=output_path, dataset=dataset)
    manifest["storage"]["manifest_path"] = normalize_dataset_path(manifest_path)
    failures = validate_manifest(manifest)
    if failures:
        raise SystemExit("Invalid generated manifest:\n" + "\n".join(failures))
    output_path.write_text(json.dumps(dataset, indent=2), encoding="utf-8")
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Wrote toy dataset to {output_path}")
    print(f"Wrote toy manifest to {manifest_path}")
    print(f"Windows: {len(dataset['windows'])}")
    print(f"Held-out subjects: {', '.join(dataset['metadata']['heldout_subjects'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
