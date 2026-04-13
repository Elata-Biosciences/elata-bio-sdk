#!/usr/bin/env python3
"""Prepare a candidate Athena internal manifest from a standardized session-export root."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib

from manifest_contract import normalize_dataset_path


REQUIRED_SESSION_FIELDS = [
    "subject_id",
    "session_id",
    "protocol",
    "task_label",
    "timestamp_source",
    "modalities",
]


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def validate_session_sidecar(
    *,
    payload: dict,
    sidecar_path: Path,
    required_modalities: set[str],
    optional_modalities: set[str],
) -> list[str]:
    failures: list[str] = []
    for field in REQUIRED_SESSION_FIELDS:
        if field not in payload:
            failures.append(f"{sidecar_path}: missing required field `{field}`.")

    modalities = payload.get("modalities")
    if not isinstance(modalities, dict):
        failures.append(f"{sidecar_path}: `modalities` must be an object.")
        return failures

    allowed_modalities = required_modalities | optional_modalities
    unknown_modalities = sorted(set(modalities) - allowed_modalities)
    if unknown_modalities:
        failures.append(f"{sidecar_path}: unknown modalities {unknown_modalities}.")

    for modality in sorted(required_modalities):
        block = modalities.get(modality)
        if not isinstance(block, dict):
            failures.append(f"{sidecar_path}: required modality `{modality}` block is missing.")
            continue
        if block.get("present") is not True:
            failures.append(f"{sidecar_path}: required modality `{modality}` must have `present = true`.")
            continue
        if not block.get("relative_path"):
            failures.append(f"{sidecar_path}: modality `{modality}` must include `relative_path`.")
        if "feature_dim" not in block:
            failures.append(f"{sidecar_path}: modality `{modality}` must include `feature_dim`.")

    for modality_name, block in modalities.items():
        if not isinstance(block, dict):
            failures.append(f"{sidecar_path}: modality `{modality_name}` must be an object.")
            continue
        if block.get("present") not in {True, False}:
            failures.append(f"{sidecar_path}: modality `{modality_name}` must include boolean `present`.")
        if block.get("present"):
            if not block.get("relative_path"):
                failures.append(f"{sidecar_path}: modality `{modality_name}` must include `relative_path` when present.")
            if "feature_dim" not in block:
                failures.append(f"{sidecar_path}: modality `{modality_name}` must include `feature_dim` when present.")

    return failures


def resolve_session_files(sidecar_path: Path, payload: dict) -> list[str]:
    failures: list[str] = []
    for modality_name, block in payload["modalities"].items():
        if not block.get("present"):
            continue
        relative_path = block.get("relative_path")
        if not relative_path:
            continue
        file_path = sidecar_path.parent / relative_path
        if not file_path.exists():
            failures.append(f"{sidecar_path}: modality `{modality_name}` file is missing: {file_path}")
            continue
        if file_path.stat().st_size == 0:
            failures.append(f"{sidecar_path}: modality `{modality_name}` file is empty: {file_path}")
    return failures


def load_template(path: Path) -> dict:
    return read_json(path)


def make_session_record(sidecar_path: Path, payload: dict) -> dict:
    session_dir = sidecar_path.parent
    modalities: dict[str, dict] = {}
    for modality_name, block in payload["modalities"].items():
        record = dict(block)
        relative_path = block.get("relative_path")
        if relative_path:
            file_path = session_dir / relative_path
            record["path"] = normalize_dataset_path(file_path)
            record["bytes"] = file_path.stat().st_size if file_path.exists() else 0
        modalities[modality_name] = record

    return {
        "subject_id": payload["subject_id"],
        "session_id": payload["session_id"],
        "protocol": payload["protocol"],
        "task_label": payload["task_label"],
        "timestamp_source": payload["timestamp_source"],
        "start_time_utc": payload.get("start_time_utc"),
        "duration_seconds": payload.get("duration_seconds"),
        "labels": dict(payload.get("labels", {})),
        "shift_metadata": dict(payload.get("shift_metadata", {})),
        "quality_fields": list(payload.get("quality_fields", [])),
        "artifact_fields": list(payload.get("artifact_fields", [])),
        "modalities": modalities,
        "sidecar_path": normalize_dataset_path(sidecar_path),
        "session_root": normalize_dataset_path(session_dir),
    }


def sorted_unique(items: list[str]) -> list[str]:
    return sorted(set(item for item in items if item))


def summarize_modality(session_records: list[dict], modality_name: str, template_block: dict) -> tuple[dict, list[str]]:
    notes: list[str] = []
    all_blocks = [
        record["modalities"][modality_name]
        for record in session_records
        if modality_name in record["modalities"]
    ]
    blocks = [
        record["modalities"][modality_name]
        for record in session_records
        if modality_name in record["modalities"] and record["modalities"][modality_name].get("present")
    ]
    if not blocks:
        summary = dict(template_block)
        summary["present"] = False
        verification_statuses = sorted_unique([str(block.get("verification_status", "")) for block in all_blocks])
        if verification_statuses:
            summary["verification_status"] = (
                verification_statuses[0] if len(verification_statuses) == 1 else "mixed_session_verification"
            )
        if modality_name == "fnirs":
            transport_signals = sorted_unique([str(block.get("transport_signal", "")) for block in all_blocks])
            processing_statuses = sorted_unique([str(block.get("processing_status", "")) for block in all_blocks])
            if transport_signals:
                summary["transport_signal"] = transport_signals[0] if len(transport_signals) == 1 else "mixed"
            if processing_statuses:
                summary["processing_status"] = processing_statuses[0] if len(processing_statuses) == 1 else "mixed"
        if modality_name == "ppg":
            mapping_statuses = sorted_unique([str(block.get("mapping_status", "")) for block in all_blocks])
            if mapping_statuses:
                summary["mapping_status"] = mapping_statuses[0] if len(mapping_statuses) == 1 else "mixed"
        return (summary, notes)

    feature_dims = sorted({block.get("feature_dim") for block in blocks if block.get("feature_dim") is not None})
    sampling_rates = sorted({block.get("sampling_rate_hz") for block in blocks if block.get("sampling_rate_hz") is not None})
    geometry_values = {bool(block.get("geometry_available", False)) for block in blocks}

    summary = dict(template_block)
    summary["present"] = True
    summary["feature_dim"] = feature_dims[0] if len(feature_dims) == 1 else max(feature_dims)
    if len(feature_dims) > 1:
        notes.append(f"{modality_name} feature_dim varied across sessions: {feature_dims}")
    summary["sampling_rate_hz"] = sampling_rates[0] if len(sampling_rates) == 1 else None
    if len(sampling_rates) > 1:
        notes.append(f"{modality_name} sampling_rate_hz varied across sessions: {sampling_rates}")
    summary["geometry_available"] = True if geometry_values == {True} else bool(template_block.get("geometry_available", False))

    channel_name_sets = {
        tuple(block.get("channel_names", []))
        for block in blocks
        if block.get("channel_names")
    }
    if len(channel_name_sets) == 1:
        summary["channel_names"] = list(next(iter(channel_name_sets)))
    elif len(channel_name_sets) > 1:
        notes.append(f"{modality_name} channel_names varied across sessions.")

    verification_statuses = sorted_unique([str(block.get("verification_status", "")) for block in blocks])
    if verification_statuses:
        summary["verification_status"] = verification_statuses[0] if len(verification_statuses) == 1 else "mixed_session_verification"
    if modality_name == "fnirs":
        transport_signals = sorted_unique([str(block.get("transport_signal", "")) for block in blocks])
        processing_statuses = sorted_unique([str(block.get("processing_status", "")) for block in blocks])
        if transport_signals:
            summary["transport_signal"] = transport_signals[0] if len(transport_signals) == 1 else "mixed"
        if processing_statuses:
            summary["processing_status"] = processing_statuses[0] if len(processing_statuses) == 1 else "mixed"
    if modality_name == "ppg":
        mapping_statuses = sorted_unique([str(block.get("mapping_status", "")) for block in blocks])
        if mapping_statuses:
            summary["mapping_status"] = mapping_statuses[0] if len(mapping_statuses) == 1 else "mixed"

    return (summary, notes)


def build_blockers(session_records: list[dict], required_modalities: set[str]) -> list[str]:
    blockers: list[str] = []
    fnirs_pending_sessions: list[str] = []
    ppg_pending_sessions: list[str] = []
    timestamp_missing_sessions: list[str] = []
    event_missing_sessions: list[str] = []

    for record in session_records:
        if not record.get("timestamp_source"):
            timestamp_missing_sessions.append(record["session_id"])
        if not record["labels"].get("event_labels_present", False):
            event_missing_sessions.append(record["session_id"])
        for modality_name in required_modalities:
            block = record["modalities"].get(modality_name, {})
            if not block.get("present"):
                blockers.append(f"Required modality `{modality_name}` is missing in session `{record['session_id']}`.")
        fnirs_block = record["modalities"].get("fnirs", {})
        if fnirs_block.get("present") and fnirs_block.get("processing_status") != "confirmed_internal_pipeline":
            fnirs_pending_sessions.append(record["session_id"])
        ppg_block = record["modalities"].get("ppg", {})
        if ppg_block.get("present") and ppg_block.get("mapping_status") != "confirmed_internal_mapping":
            ppg_pending_sessions.append(record["session_id"])

    if fnirs_pending_sessions:
        blockers.append(
            "Athena fNIRS processing remains unconfirmed for sessions: "
            + ", ".join(sorted_unique(fnirs_pending_sessions))
            + "."
        )
    if ppg_pending_sessions:
        blockers.append(
            "Athena PPG mapping remains unconfirmed for sessions: "
            + ", ".join(sorted_unique(ppg_pending_sessions))
            + "."
        )
    if timestamp_missing_sessions:
        blockers.append(
            "Athena timestamp source is missing for sessions: "
            + ", ".join(sorted_unique(timestamp_missing_sessions))
            + "."
        )
    if event_missing_sessions:
        blockers.append(
            "Athena event-label export is not yet demonstrated for sessions: "
            + ", ".join(sorted_unique(event_missing_sessions))
            + "."
        )
    return blockers


def build_manifest(template: dict, config: dict, session_records: list[dict], blockers: list[str]) -> tuple[dict, list[str]]:
    manifest = json.loads(json.dumps(template))
    modality_notes: list[str] = []

    dataset_root = Path(config["storage"]["dataset_root"])
    output_manifest_path = Path(config["outputs"]["manifest"])

    manifest["identity"]["dataset_name"] = config["prepare"]["dataset_name"]
    manifest["identity"]["dataset_version"] = config["prepare"]["dataset_version"]
    manifest["identity"]["source_type"] = "internal"
    manifest["identity"]["intake_status"] = config["prepare"].get("intake_status", "candidate")
    manifest["identity"]["source_uri"] = config["storage"]["source_uri"]
    manifest["identity"]["license"] = config["storage"]["license"]

    manifest["storage"]["dataset_path"] = normalize_dataset_path(dataset_root)
    manifest["storage"]["manifest_path"] = normalize_dataset_path(output_manifest_path)

    subject_ids = sorted_unique([record["subject_id"] for record in session_records])
    session_ids = sorted_unique([record["session_id"] for record in session_records])
    protocols = sorted_unique([record["protocol"] for record in session_records])
    shift_keys = sorted_unique(
        [key for record in session_records for key in record.get("shift_metadata", {}).keys()]
    )

    manifest["coverage"]["subject_ids"] = subject_ids
    manifest["coverage"]["session_ids"] = session_ids
    manifest["coverage"]["protocols"] = protocols
    manifest["coverage"]["shift_metadata_keys"] = shift_keys

    manifest["split_summary"]["train_windows"] = 0
    manifest["split_summary"]["eval_windows"] = 0
    manifest["split_summary"]["heldout_subjects"] = []

    labels = manifest["labels"]
    labels["task_labels_present"] = any(record["labels"].get("task_labels_present", False) for record in session_records)
    labels["event_labels_present"] = any(record["labels"].get("event_labels_present", False) for record in session_records)
    labels["ppg_morphology_targets_present"] = any(
        record["labels"].get("ppg_morphology_targets_present", False) for record in session_records
    )

    manifest["quality"]["quality_fields"] = sorted_unique(
        [field for record in session_records for field in record.get("quality_fields", [])]
    )
    manifest["quality"]["artifact_fields"] = sorted_unique(
        [field for record in session_records for field in record.get("artifact_fields", [])]
    )

    for modality_name, template_block in manifest["modalities"].items():
        summary, notes = summarize_modality(session_records, modality_name, template_block)
        manifest["modalities"][modality_name] = summary
        modality_notes.extend(notes)

    manifest.setdefault("notes", [])
    manifest["notes"] = [
        *manifest["notes"],
        "Prepared by scripts/cross_modal/prepare_athena_dataset.py from a standardized Athena session-export contract.",
        "This candidate manifest is inventory-backed but still provisional until real internal Athena recordings replace the fixture root.",
    ]
    for blocker in blockers:
        manifest["notes"].append(f"Open blocker: {blocker}")
    for note in modality_notes:
        manifest["notes"].append(f"Aggregation note: {note}")

    return (manifest, modality_notes)


def write_report(
    *,
    report_path: Path,
    config_path: Path,
    dataset_root: Path,
    session_records: list[dict],
    required_modalities: set[str],
    blockers: list[str],
    modality_notes: list[str],
    manifest_path: Path,
) -> None:
    subject_ids = sorted_unique([record["subject_id"] for record in session_records])
    protocols = sorted_unique([record["protocol"] for record in session_records])
    required_modality_list = ", ".join(f"`{name}`" for name in sorted(required_modalities))
    lines = [
        "# Athena Internal Pilot Report",
        "",
        "Status: Candidate prep path",
        "",
        "## Inputs",
        "",
        f"- Config: `{normalize_dataset_path(config_path)}`",
        f"- Capture root: `{normalize_dataset_path(dataset_root)}`",
        f"- Output manifest: `{normalize_dataset_path(manifest_path)}`",
        "",
        "## Overview",
        "",
        f"- subjects discovered: `{len(subject_ids)}`",
        f"- sessions discovered: `{len(session_records)}`",
        f"- protocols discovered: `{', '.join(protocols)}`" if protocols else "- protocols discovered: none",
        f"- required modality coverage: {required_modality_list} present in all `{len(session_records)}` sessions",
        "",
        "## Session Export Contract",
        "",
        "- Each session directory must contain `athena_session.json`.",
        "- The sidecar is the source of truth for subject/session IDs, protocol labels, timestamp source, modality file paths, and quality metadata.",
        "- The prep path intentionally keeps Athena intake at `candidate` status until real internal recordings replace the fixture and unresolved mapping questions are closed.",
        "",
        "## Session Inventory",
        "",
    ]
    for record in session_records:
        modalities = ", ".join(
            modality_name
            for modality_name, block in record["modalities"].items()
            if block.get("present")
        )
        lines.extend(
            [
                f"- `{record['session_id']}`",
                f"  subject `{record['subject_id']}`, protocol `{record['protocol']}`, task `{record['task_label']}`, modalities `{modalities}`",
            ]
        )
    lines.extend(["", "## Open Blockers", ""])
    if blockers:
        lines.extend([f"- {blocker}" for blocker in blockers])
    else:
        lines.append("- none")
    lines.extend(["", "## Aggregation Notes", ""])
    if modality_notes:
        lines.extend([f"- {note}" for note in modality_notes])
    else:
        lines.append("- none")
    lines.extend(
        [
            "",
            "## Recommendation",
            "",
            "- keep as candidate",
            "- use this pilot contract to mount real Athena captures into the repo-local Phase 1 flow",
            "- do not start Athena Phase 5 modeling until the real internal export closes the fNIRS processing, PPG mapping, and event-label blockers listed above",
            "",
            "## Commands",
            "",
            "```powershell",
            f"python scripts/cross_modal/prepare_athena_dataset.py --config {normalize_dataset_path(config_path)}",
            f"python scripts/cross_modal/validate_manifest_file.py {normalize_dataset_path(manifest_path)}",
            "```",
        ]
    )
    ensure_parent(report_path)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare a candidate Athena manifest from a session-export root.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/athena_prepare_fixture.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    dataset_root = Path(config["storage"]["dataset_root"])
    template_manifest_path = Path(config["inputs"]["template_manifest"])
    sidecar_name = config["prepare"].get("session_sidecar_name", "athena_session.json")
    required_modalities = set(config["prepare"].get("required_modalities", ["eeg", "fnirs", "ppg"]))
    optional_modalities = set(config["prepare"].get("optional_modalities", ["imu"]))

    sidecars = sorted(dataset_root.rglob(sidecar_name))
    if not sidecars:
        raise SystemExit(f"No `{sidecar_name}` files found under {dataset_root}")

    failures: list[str] = []
    session_records: list[dict] = []
    seen_subject_session_pairs: set[tuple[str, str]] = set()
    for sidecar_path in sidecars:
        payload = read_json(sidecar_path)
        failures.extend(
            validate_session_sidecar(
                payload=payload,
                sidecar_path=sidecar_path,
                required_modalities=required_modalities,
                optional_modalities=optional_modalities,
            )
        )
        failures.extend(resolve_session_files(sidecar_path, payload))
        key = (payload.get("subject_id", ""), payload.get("session_id", ""))
        if key in seen_subject_session_pairs:
            failures.append(f"{sidecar_path}: duplicate subject/session pair {key}.")
        seen_subject_session_pairs.add(key)
        session_records.append(make_session_record(sidecar_path, payload))

    if failures:
        for failure in failures:
            print(failure)
        return 1

    blockers = build_blockers(session_records, required_modalities)
    template = load_template(template_manifest_path)
    manifest, modality_notes = build_manifest(template, config, session_records, blockers)

    manifest_path = Path(config["outputs"]["manifest"])
    metrics_path = Path(config["outputs"]["metrics"])
    report_path = Path(config["outputs"]["report"])

    metrics = {
        "kind": "athena_internal_prepare_metrics",
        "config_path": normalize_dataset_path(config_path),
        "dataset_root": normalize_dataset_path(dataset_root),
        "template_manifest": normalize_dataset_path(template_manifest_path),
        "subject_count": len(sorted_unique([record["subject_id"] for record in session_records])),
        "session_count": len(session_records),
        "protocols": sorted_unique([record["protocol"] for record in session_records]),
        "blockers": blockers,
        "aggregation_notes": modality_notes,
        "sessions": session_records,
    }

    ensure_parent(manifest_path)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    ensure_parent(metrics_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    write_report(
        report_path=report_path,
        config_path=config_path,
        dataset_root=dataset_root,
        session_records=session_records,
        required_modalities=required_modalities,
        blockers=blockers,
        modality_notes=modality_notes,
        manifest_path=manifest_path,
    )

    print(f"Wrote Athena candidate manifest to {manifest_path}")
    print(f"Wrote Athena prep metrics to {metrics_path}")
    print(f"Wrote Athena prep report to {report_path}")
    print(f"Sessions discovered: {len(session_records)}")
    print(f"Open blockers: {len(blockers)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
