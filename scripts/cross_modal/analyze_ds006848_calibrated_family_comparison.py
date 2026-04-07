#!/usr/bin/env python3
"""Compare DS006848 calibrated absolute target-family behavior across cohort variants."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib


def load_config(path: Path) -> dict:
    with path.open("rb") as handle:
        return tomllib.load(handle)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def mean(values: list[float]) -> float:
    return sum(values) / len(values)


def compute_family_summary(branch_metrics: dict, target_names: list[str]) -> dict[str, float | bool]:
    relative_mses = [float(branch_metrics["per_target"][target_name]["relative_mse"]) for target_name in target_names]
    relative_maes = [float(branch_metrics["per_target"][target_name]["relative_mae"]) for target_name in target_names]
    aggregate_relative_mse = mean(relative_mses)
    return {
        "target_names": target_names,
        "aggregate_relative_mse": aggregate_relative_mse,
        "aggregate_relative_mae": mean(relative_maes),
        "beats_null_relative_mse": aggregate_relative_mse < 1.0,
    }


def compute_subject_family_summary(branch_metrics: dict, target_names: list[str]) -> dict[str, dict[str, float | bool]]:
    subject_ids = sorted(branch_metrics["per_target"][target_names[0]]["per_subject"].keys())
    summary: dict[str, dict[str, float | bool]] = {}
    for subject_id in subject_ids:
        relative_mses = [
            float(branch_metrics["per_target"][target_name]["per_subject"][subject_id]["relative_mse"])
            for target_name in target_names
        ]
        aggregate_relative_mse = mean(relative_mses)
        summary[subject_id] = {
            "aggregate_relative_mse": aggregate_relative_mse,
            "beats_null_relative_mse": aggregate_relative_mse < 1.0,
        }
    return summary


def build_report(metrics: dict) -> str:
    lines = [
        "# DS006848 Calibrated Family Comparison Report",
        "",
        f"- Mode: `{metrics['mode']}`",
        f"- Branch: `{metrics['branch']}`",
        "",
    ]
    for run_name, run_metrics in metrics["runs"].items():
        lines.extend(
            [
                f"## {run_name}",
                "",
                f"- Source metrics: `{run_metrics['source_metrics']}`",
                "",
            ]
        )
        for target_set_name, target_set_metrics in run_metrics["target_sets"].items():
            lines.extend(
                [
                    f"### {target_set_name}",
                    "",
                    f"- Aggregate relative MSE: `{target_set_metrics['aggregate_relative_mse']:.6f}`",
                    f"- Aggregate relative MAE: `{target_set_metrics['aggregate_relative_mae']:.6f}`",
                    f"- Beats null aggregate relative MSE: `{target_set_metrics['beats_null_relative_mse']}`",
                    f"- Targets: `{', '.join(target_set_metrics['target_names'])}`",
                    "",
                ]
            )
        lines.extend(["### Per-subject family summary", ""])
        for subject_id, family_map in run_metrics["per_subject"].items():
            amplitude = family_map["amplitude_family"]["aggregate_relative_mse"]
            timing = family_map["timing_family"]["aggregate_relative_mse"]
            lines.append(
                f"- `{subject_id}` amplitude relative MSE `{amplitude:.6f}`, timing relative MSE `{timing:.6f}`"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare DS006848 calibrated family behavior across cohorts.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_calibrated_family_comparison.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    mode = str(config["comparison"]["mode"])
    branch = str(config["comparison"]["branch"])
    run_paths = {name: Path(path) for name, path in config["comparison"]["runs"].items()}
    family_config = config["comparison"]["target_families"]

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "mode": mode,
        "branch": branch,
        "runs": {},
    }

    for run_name, path in run_paths.items():
        run_metrics = load_json(path)
        branch_metrics = run_metrics["modes"][mode]["branches"][branch]
        full_targets = list(run_metrics["aggregate_target_names"])
        family_targets = {
            "full": full_targets,
            "amplitude_family": list(family_config["amplitude_family"]),
            "timing_family": list(family_config["timing_family"]),
        }

        target_sets: dict[str, dict] = {}
        for target_set_name in config["comparison"]["target_sets"]:
            target_names = family_targets[target_set_name]
            target_sets[target_set_name] = compute_family_summary(branch_metrics, target_names)

        subject_ids = sorted(branch_metrics["per_target"][full_targets[0]]["per_subject"].keys())
        per_subject: dict[str, dict] = {}
        for subject_id in subject_ids:
            per_subject[subject_id] = {}
            for family_name in ["amplitude_family", "timing_family"]:
                target_names = family_targets[family_name]
                subject_relative_mses = [
                    float(branch_metrics["per_target"][target_name]["per_subject"][subject_id]["relative_mse"])
                    for target_name in target_names
                ]
                aggregate_relative_mse = mean(subject_relative_mses)
                per_subject[subject_id][family_name] = {
                    "aggregate_relative_mse": aggregate_relative_mse,
                    "beats_null_relative_mse": aggregate_relative_mse < 1.0,
                }

        metrics["runs"][run_name] = {
            "source_metrics": str(path).replace("\\", "/"),
            "target_sets": target_sets,
            "per_subject": per_subject,
        }

    metrics_path = Path(config["paths"]["metrics"])
    report_path = Path(config["paths"]["report"])
    ensure_parent(metrics_path)
    ensure_parent(report_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text(build_report(metrics), encoding="utf-8")
    print(f"Wrote family comparison metrics to {metrics_path}")
    print(f"Wrote family comparison report to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
