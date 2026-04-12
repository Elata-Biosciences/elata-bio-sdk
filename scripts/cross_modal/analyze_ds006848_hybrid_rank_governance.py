#!/usr/bin/env python3
"""Analyze DS006848 hybrid-rank governance across amplitude and morphology runs."""

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


def select_rank(run_metrics: dict, policy: dict) -> tuple[dict, int, str]:
    mode = str(policy["mode"])
    if mode == "best_rank":
        rank = int(run_metrics["best_rank"])
        return run_metrics["ranks"][str(rank)], rank, "best_rank"
    if mode == "fixed_rank":
        rank = int(policy["rank"])
        rank_key = str(rank)
        if rank_key not in run_metrics["ranks"]:
            raise SystemExit(f"Rank {rank} missing from metrics.")
        return run_metrics["ranks"][rank_key], rank, f"fixed_rank_{rank}"
    raise SystemExit(f"Unsupported policy mode: {mode}")


def build_target_sets(run_metrics: dict, amplitude_targets: list[str], timing_targets: list[str]) -> dict[str, list[str]]:
    full_targets = list(run_metrics["aggregate_target_names"])
    target_sets = {"full": full_targets}
    if all(target in run_metrics["target_names"] for target in amplitude_targets):
        target_sets["amplitude_family"] = list(amplitude_targets)
    if all(target in run_metrics["target_names"] for target in timing_targets):
        target_sets["timing_family"] = list(timing_targets)
    return target_sets


def compute_target_set_summary(rank_metrics: dict, target_names: list[str]) -> dict[str, float | bool | list[str]]:
    relative_mses = [float(rank_metrics["per_target"][target_name]["relative_mse"]) for target_name in target_names]
    relative_maes = [float(rank_metrics["per_target"][target_name]["relative_mae"]) for target_name in target_names]
    aggregate_relative_mse = mean(relative_mses)
    return {
        "target_names": target_names,
        "aggregate_relative_mse": aggregate_relative_mse,
        "aggregate_relative_mae": mean(relative_maes),
        "beats_null_relative_mse": aggregate_relative_mse < 1.0,
    }


def compute_focus_subject_summary(
    rank_metrics: dict,
    target_sets: dict[str, list[str]],
    focus_subjects: list[str],
) -> dict[str, dict[str, dict[str, float | bool]]]:
    summary: dict[str, dict[str, dict[str, float | bool]]] = {}
    for subject_id in focus_subjects:
        family_summary: dict[str, dict[str, float | bool]] = {}
        for target_set_name, target_names in target_sets.items():
            if not target_names:
                continue
            first_target = target_names[0]
            per_subject = rank_metrics["per_target"][first_target].get("per_subject", {})
            if subject_id not in per_subject:
                continue
            relative_mses = [
                float(rank_metrics["per_target"][target_name]["per_subject"][subject_id]["relative_mse"])
                for target_name in target_names
            ]
            aggregate_relative_mse = mean(relative_mses)
            family_summary[target_set_name] = {
                "aggregate_relative_mse": aggregate_relative_mse,
                "beats_null_relative_mse": aggregate_relative_mse < 1.0,
            }
        if family_summary:
            summary[subject_id] = family_summary
    return summary


def format_delta(value: float) -> str:
    return f"{value:+.6f}"


def build_report(metrics: dict) -> str:
    best_policy_name = metrics["best_policy_name"]
    lines = [
        "# DS006848 Hybrid Rank Governance Report",
        "",
        f"- Label: `{metrics['label']}`",
        f"- Best-reference policy: `{best_policy_name}`",
        "",
        "## Policy summary",
        "",
        "| Policy | Mean primary relative MSE | Accepted amplitude mean | Stress amplitude mean | Morphology mean | Null-beating runs | Worst delta vs best |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    for policy_name, policy_metrics in metrics["policies"].items():
        summary = policy_metrics["summary"]
        lines.append(
            "| "
            + " | ".join(
                [
                    policy_name,
                    f"{summary['mean_primary_relative_mse']:.6f}",
                    f"{summary['accepted_amplitude_mean_relative_mse']:.6f}",
                    f"{summary['stress_amplitude_mean_relative_mse']:.6f}",
                    f"{summary['morphology_mean_relative_mse']:.6f}",
                    f"{summary['null_beating_runs']} / {summary['run_count']}",
                    format_delta(summary["worst_delta_vs_best"]),
                ]
            )
            + " |"
        )

    lines.extend(["", "## Run details", ""])

    for run_name, run_metrics in metrics["runs"].items():
        lines.extend(
            [
                f"### {run_name}",
                "",
                f"- Track: `{run_metrics['track']}`",
                f"- Primary target set: `{run_metrics['primary_target_set']}`",
                f"- Source metrics: `{run_metrics['source_metrics']}`",
                "",
                "| Policy | Selected rank | Primary relative MSE | Beats null | Delta vs best |",
                "| --- | ---: | ---: | ---: | ---: |",
            ]
        )
        for policy_name, selection in run_metrics["policies"].items():
            primary = selection["target_sets"][run_metrics["primary_target_set"]]
            lines.append(
                "| "
                + " | ".join(
                    [
                        policy_name,
                        str(selection["selected_rank"]),
                        f"{primary['aggregate_relative_mse']:.6f}",
                        str(primary["beats_null_relative_mse"]),
                        format_delta(selection["primary_delta_vs_best"]),
                    ]
                )
                + " |"
            )

        best_selection = run_metrics["policies"][best_policy_name]
        extra_target_sets = [
            name
            for name in best_selection["target_sets"]
            if name != run_metrics["primary_target_set"]
            and best_selection["target_sets"][name]["target_names"] != best_selection["target_sets"][run_metrics["primary_target_set"]]["target_names"]
        ]
        if extra_target_sets:
            lines.append("")
            for target_set_name in extra_target_sets:
                lines.append(f"- `{best_policy_name}` {target_set_name} relative MSE: `{best_selection['target_sets'][target_set_name]['aggregate_relative_mse']:.6f}`")

        focus_subjects = sorted(
            {
                subject_id
                for selection in run_metrics["policies"].values()
                for subject_id in selection["focus_subjects"]
            }
        )
        if focus_subjects:
            lines.extend(["", "Focused subject reads:", ""])
            for subject_id in focus_subjects:
                parts = []
                for policy_name, selection in run_metrics["policies"].items():
                    subject_metrics = selection["focus_subjects"].get(subject_id, {})
                    primary_subject = subject_metrics.get(run_metrics["primary_target_set"])
                    if primary_subject is None:
                        continue
                    parts.append(
                        f"`{policy_name}` {run_metrics['primary_target_set']} `{primary_subject['aggregate_relative_mse']:.6f}`"
                    )
                if parts:
                    lines.append(f"- `{subject_id}`: " + ", ".join(parts))
        lines.append("")

    if "shared_rank_16" in metrics["policies"] and "shared_rank_512" in metrics["policies"]:
        shared_16 = metrics["policies"]["shared_rank_16"]["summary"]
        shared_512 = metrics["policies"]["shared_rank_512"]["summary"]
        lines.extend(
            [
                "## Interpretation",
                "",
                f"- shared `rank 16` keeps `{shared_16['null_beating_runs']} / {shared_16['run_count']}` tracked runs below null",
                f"- shared `rank 512` keeps `{shared_512['null_beating_runs']} / {shared_512['run_count']}` tracked runs below null",
                f"- shared `rank 16` average primary relative MSE is `{shared_16['mean_primary_relative_mse']:.6f}` versus `{shared_512['mean_primary_relative_mse']:.6f}` for shared `rank 512`",
                f"- the worst shared-`16` degradation versus per-run best is only `{shared_16['worst_delta_vs_best']:+.6f}`",
                f"- the worst shared-`512` degradation versus per-run best is `{shared_512['worst_delta_vs_best']:+.6f}`",
                "",
            ]
        )

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze DS006848 hybrid-rank governance.")
    parser.add_argument(
        "--config",
        default="configs/cross_modal/ds006848_hybrid_rank_governance.toml",
        help="Path to the TOML config file.",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(config_path)
    governance_config = config["governance"]

    label = str(governance_config["label"])
    amplitude_targets = list(governance_config["target_families"]["amplitude_family"])
    timing_targets = list(governance_config["target_families"]["timing_family"])
    focus_subjects = list(governance_config.get("focus_subjects", []))
    policies = list(governance_config["policies"])
    runs = list(governance_config["runs"])
    best_policy_name = str(governance_config.get("best_policy_name", "best_per_run"))

    metrics = {
        "config": str(config_path).replace("\\", "/"),
        "label": label,
        "best_policy_name": best_policy_name,
        "runs": {},
        "policies": {},
    }

    for run in runs:
        run_name = str(run["name"])
        source_metrics = Path(str(run["path"]))
        run_metrics = load_json(source_metrics)
        target_sets = build_target_sets(run_metrics, amplitude_targets, timing_targets)
        primary_target_set = str(run["primary_target_set"])
        if primary_target_set not in target_sets:
            raise SystemExit(f"Primary target set {primary_target_set} missing from {run_name}.")

        metrics["runs"][run_name] = {
            "track": str(run["track"]),
            "source_metrics": str(source_metrics).replace("\\", "/"),
            "primary_target_set": primary_target_set,
            "policies": {},
        }

        for policy in policies:
            policy_name = str(policy["name"])
            rank_metrics, selected_rank, rank_selection = select_rank(run_metrics, policy)
            selection_target_sets = {
                target_set_name: compute_target_set_summary(rank_metrics, target_names)
                for target_set_name, target_names in target_sets.items()
            }
            metrics["runs"][run_name]["policies"][policy_name] = {
                "rank_selection": rank_selection,
                "selected_rank": selected_rank,
                "target_sets": selection_target_sets,
                "focus_subjects": compute_focus_subject_summary(rank_metrics, target_sets, focus_subjects),
            }

    if best_policy_name not in [str(policy["name"]) for policy in policies]:
        raise SystemExit(f"Best-reference policy {best_policy_name} missing from config.")

    for run_name, run_metrics in metrics["runs"].items():
        best_primary = run_metrics["policies"][best_policy_name]["target_sets"][run_metrics["primary_target_set"]][
            "aggregate_relative_mse"
        ]
        for selection in run_metrics["policies"].values():
            primary = selection["target_sets"][run_metrics["primary_target_set"]]
            selection["primary_delta_vs_best"] = float(primary["aggregate_relative_mse"] - best_primary)

    for policy in policies:
        policy_name = str(policy["name"])
        primary_values: list[float] = []
        accepted_amplitude_values: list[float] = []
        stress_amplitude_values: list[float] = []
        morphology_values: list[float] = []
        null_beating_runs = 0
        worst_delta_vs_best = float("-inf")

        for run_name, run_metrics in metrics["runs"].items():
            selection = run_metrics["policies"][policy_name]
            primary = selection["target_sets"][run_metrics["primary_target_set"]]
            primary_value = float(primary["aggregate_relative_mse"])
            primary_values.append(primary_value)
            worst_delta_vs_best = max(worst_delta_vs_best, float(selection["primary_delta_vs_best"]))
            if bool(primary["beats_null_relative_mse"]):
                null_beating_runs += 1

            track = run_metrics["track"]
            if track == "accepted_amplitude":
                accepted_amplitude_values.append(primary_value)
            elif track == "stress_amplitude":
                stress_amplitude_values.append(primary_value)
            elif track == "morphology":
                morphology_values.append(primary_value)
            else:
                raise SystemExit(f"Unsupported track: {track}")

        metrics["policies"][policy_name] = {
            "mode": str(policy["mode"]),
            "rank": None if "rank" not in policy else int(policy["rank"]),
            "summary": {
                "run_count": len(primary_values),
                "null_beating_runs": null_beating_runs,
                "mean_primary_relative_mse": mean(primary_values),
                "accepted_amplitude_mean_relative_mse": mean(accepted_amplitude_values),
                "stress_amplitude_mean_relative_mse": mean(stress_amplitude_values),
                "morphology_mean_relative_mse": mean(morphology_values),
                "worst_delta_vs_best": worst_delta_vs_best,
            },
        }

    metrics_path = Path(config["paths"]["metrics"])
    report_path = Path(config["paths"]["report"])
    ensure_parent(metrics_path)
    ensure_parent(report_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    report_path.write_text(build_report(metrics), encoding="utf-8")
    print(f"Wrote hybrid rank governance metrics to {metrics_path}")
    print(f"Wrote hybrid rank governance report to {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
