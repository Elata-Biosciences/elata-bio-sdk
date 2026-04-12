#!/usr/bin/env python3
"""Compare DS006848 ranked family behavior across cohort variants."""

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


def resolve_run_metrics(run_metrics: dict, branch: str | None) -> tuple[dict, str | None, str]:
    if "modes" in run_metrics:
        if branch is None:
            raise SystemExit("Branch is required for calibrated_absolute metrics.")
        branch_metrics = run_metrics["modes"]["calibrated_absolute"]["branches"][branch]
        return branch_metrics, None, "calibrated_absolute"
    if "branches" in run_metrics:
        if branch is None:
            raise SystemExit("Branch is required for low-rank metrics with multiple branches.")
        branch_block = run_metrics["branches"][branch]
        best_rank = str(branch_block["best_rank"])
        return branch_block["ranks"][best_rank], best_rank, "best_rank_in_branch"
    best_rank = str(run_metrics["best_rank"])
    return run_metrics["ranks"][best_rank], best_rank, "best_rank"


def compute_family_summary(rank_metrics: dict, target_names: list[str]) -> dict[str, float | bool]:
    relative_mses = [float(rank_metrics["per_target"][target_name]["relative_mse"]) for target_name in target_names]
    relative_maes = [float(rank_metrics["per_target"][target_name]["relative_mae"]) for target_name in target_names]
    aggregate_relative_mse = mean(relative_mses)
    return {
        "target_names": target_names,
        "aggregate_relative_mse": aggregate_relative_mse,
        "aggregate_relative_mae": mean(relative_maes),
        "beats_null_relative_mse": aggregate_relative_mse < 1.0,
    }


def compute_subject_family_summary(rank_metrics: dict, target_names: list[str]) -> dict[str, dict[str, float | bool]]:
    per_target = rank_metrics["per_target"]
    first_target = target_names[0]
    per_subject_source = per_target[first_target].get("per_subject", {})
    if not per_subject_source:
        return {}
    subject_ids = sorted(per_subject_source.keys())
    summary: dict[str, dict[str, float | bool]] = {}
    for subject_id in subject_ids:
        relative_mses = [
            float(per_target[target_name]["per_subject"][subject_id]["relative_mse"])
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
        "# DS006848 Ranked Family Comparison Report",
        "",
        f"- Label: `{metrics['label']}`",
        f"- Branch: `{metrics['branch']}`" if metrics["branch"] else "- Branch: `(single-branch metrics)`",
        "",
    ]
    for run_name, run_metrics in metrics["runs"].items():
        lines.extend(
            [
                f"## {run_name}",
                "",
                f"- Source metrics: `{run_metrics['source_metrics']}`",
                f"- Rank selection: `{run_metrics['rank_selection']}`",
            ]
        )
        if run_metrics["best_rank"] is not None:
            lines.append(f"- Best rank: `{run_metrics['best_rank']}`")
        lines.append("")
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
        if run_metrics["per_subject"]:
            lines.extend(["### Per-subject family summary", ""])
            for subject_id, family_map in run_metrics["per_subject"].items():
                amplitude = family_map["amplitude_family"]["aggregate_relative_mse"]
                timing = family_map["timing_family"]["aggregate_relative_mse"]
                full = family_map["full"]["aggregate_relative_mse"]
                lines.append(
                    f"- `{subject_id}` full relative MSE `{full:.6f}`, amplitude relative MSE `{amplitude:.6f}`, timing relative MSE `{timing:.6f}`"
                )
            lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare DS006848 ranked family behavior across cohorts.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_hybrid_detail_family_comparison.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    label = str(config["comparison"]["label"])
    branch = config["comparison"].get("branch")
    branch_name = str(branch) if branch not in (None, "") else None
    run_paths = {name: Path(path) for name, path in config["comparison"]["runs"].items()}
    family_config = config["comparison"]["target_families"]

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "label": label,
        "branch": branch_name,
        "runs": {},
    }

    for run_name, path in run_paths.items():
        run_metrics = load_json(path)
        selected_metrics, best_rank, rank_selection = resolve_run_metrics(run_metrics, branch_name)
        full_targets = list(run_metrics["aggregate_target_names"])
        family_targets = {
            "full": full_targets,
            "amplitude_family": list(family_config["amplitude_family"]),
            "timing_family": list(family_config["timing_family"]),
        }

        target_sets: dict[str, dict] = {}
        for target_set_name in config["comparison"]["target_sets"]:
            target_names = family_targets[target_set_name]
            target_sets[target_set_name] = compute_family_summary(selected_metrics, target_names)

        per_subject: dict[str, dict] = {}
        if selected_metrics["per_target"][full_targets[0]].get("per_subject"):
            subject_ids = sorted(selected_metrics["per_target"][full_targets[0]]["per_subject"].keys())
            for subject_id in subject_ids:
                per_subject[subject_id] = {}
                for family_name, target_names in family_targets.items():
                    subject_relative_mses = [
                        float(selected_metrics["per_target"][target_name]["per_subject"][subject_id]["relative_mse"])
                        for target_name in target_names
                    ]
                    aggregate_relative_mse = mean(subject_relative_mses)
                    per_subject[subject_id][family_name] = {
                        "aggregate_relative_mse": aggregate_relative_mse,
                        "beats_null_relative_mse": aggregate_relative_mse < 1.0,
                    }

        metrics["runs"][run_name] = {
            "source_metrics": str(path).replace("\\", "/"),
            "rank_selection": rank_selection,
            "best_rank": None if best_rank is None else int(best_rank),
            "target_sets": target_sets,
            "per_subject": per_subject,
        }

    metrics_path = Path(config["paths"]["metrics"])
    report_path = Path(config["paths"]["report"])
    ensure_parent(metrics_path)
    ensure_parent(report_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text(build_report(metrics), encoding="utf-8")
    print(f"Wrote ranked family comparison metrics to {metrics_path}")
    print(f"Wrote ranked family comparison report to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
