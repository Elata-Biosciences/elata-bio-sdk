#!/usr/bin/env python3
"""Shared helpers for cross-modal dataset manifests."""

from __future__ import annotations

from pathlib import Path


SCHEMA_VERSION = "0.2"
MANIFEST_KIND = "cross_modal_dataset_manifest"


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def validate_manifest(manifest: dict) -> list[str]:
    failures: list[str] = []

    require(manifest.get("kind") == MANIFEST_KIND, f"Manifest kind must be {MANIFEST_KIND}.", failures)
    require(manifest.get("schema_version") == SCHEMA_VERSION, f"Manifest schema_version must be {SCHEMA_VERSION}.", failures)

    identity = manifest.get("identity", {})
    require(bool(identity.get("dataset_name")), "Manifest identity.dataset_name is required.", failures)
    require(bool(identity.get("dataset_version")), "Manifest identity.dataset_version is required.", failures)
    require(identity.get("source_type") in {"synthetic", "public", "internal"}, "Manifest identity.source_type must be synthetic, public, or internal.", failures)
    require(identity.get("intake_status") in {"template", "candidate", "ready"}, "Manifest identity.intake_status must be template, candidate, or ready.", failures)

    storage = manifest.get("storage", {})
    require(bool(storage.get("dataset_path")), "Manifest storage.dataset_path is required.", failures)

    modalities = manifest.get("modalities", {})
    require(isinstance(modalities, dict) and modalities, "Manifest modalities section is required.", failures)
    for modality_name, modality in modalities.items():
        require(modality.get("present") in {True, False}, f"Manifest modalities.{modality_name}.present must be boolean.", failures)
        if modality.get("present"):
            require("feature_dim" in modality, f"Manifest modalities.{modality_name}.feature_dim is required when present.", failures)

    split_summary = manifest.get("split_summary", {})
    require("train_windows" in split_summary, "Manifest split_summary.train_windows is required.", failures)
    require("eval_windows" in split_summary, "Manifest split_summary.eval_windows is required.", failures)
    require(isinstance(split_summary.get("heldout_subjects", []), list), "Manifest split_summary.heldout_subjects must be a list.", failures)
    if identity.get("intake_status") == "ready":
        require(split_summary.get("train_windows", 0) > 0, "Ready manifest split_summary.train_windows must be > 0.", failures)
        require(split_summary.get("eval_windows", 0) > 0, "Ready manifest split_summary.eval_windows must be > 0.", failures)

    coverage = manifest.get("coverage", {})
    require(isinstance(coverage.get("subject_ids", []), list), "Manifest coverage.subject_ids must be a list.", failures)
    require(isinstance(coverage.get("session_ids", []), list), "Manifest coverage.session_ids must be a list.", failures)
    if identity.get("intake_status") == "ready":
        require(len(coverage.get("subject_ids", [])) > 0, "Ready manifest coverage.subject_ids must not be empty.", failures)
        require(len(coverage.get("session_ids", [])) > 0, "Ready manifest coverage.session_ids must not be empty.", failures)

    labels = manifest.get("labels", {})
    require("event_labels_present" in labels, "Manifest labels.event_labels_present is required.", failures)
    require("ppg_morphology_targets_present" in labels, "Manifest labels.ppg_morphology_targets_present is required.", failures)

    quality = manifest.get("quality", {})
    require(isinstance(quality.get("quality_fields", []), list), "Manifest quality.quality_fields must be a list.", failures)

    return failures


def make_template() -> dict:
    return {
        "kind": MANIFEST_KIND,
        "schema_version": SCHEMA_VERSION,
        "identity": {
            "dataset_name": "replace-me",
            "dataset_version": "0.0.0",
            "source_type": "public",
            "intake_status": "candidate",
            "source_uri": "replace-me",
            "license": "review-required",
        },
        "storage": {
            "dataset_path": "replace-me",
            "manifest_path": "replace-me",
        },
        "modalities": {
            "eeg": {
                "present": True,
                "feature_dim": 0,
                "sampling_rate_hz": None,
                "geometry_available": False,
            },
            "fnirs": {
                "present": True,
                "feature_dim": 0,
                "sampling_rate_hz": None,
                "geometry_available": False,
            },
            "ppg": {
                "present": True,
                "feature_dim": 0,
                "sampling_rate_hz": None,
                "geometry_available": False,
            },
        },
        "split_summary": {
            "train_windows": 0,
            "eval_windows": 0,
            "heldout_subjects": [],
        },
        "coverage": {
            "subject_ids": [],
            "session_ids": [],
            "protocols": [],
            "shift_metadata_keys": [],
        },
        "labels": {
            "event_labels_present": False,
            "ppg_morphology_targets_present": False,
            "task_labels_present": False,
        },
        "quality": {
            "quality_fields": [],
            "artifact_fields": [],
        },
        "notes": [],
    }


def normalize_dataset_path(path: Path) -> str:
    return str(path).replace("\\", "/")
