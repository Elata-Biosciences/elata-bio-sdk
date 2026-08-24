"""Write fixtures/manifest.json recording the generation environment, seeds,
and tolerances for every fixture file."""

from __future__ import annotations

import platform

import numpy as np
import scipy

from oracle_common import write_fixture


def main() -> None:
    write_fixture(
        "manifest.json",
        {
            "schema": "elata.golden-fixture-manifest/v1",
            "generatedBy": "packages/biosignal-analytics/scripts/generate-fixtures",
            "environment": {
                "python": platform.python_version(),
                "numpy": np.__version__,
                "scipy": scipy.__version__,
                "mne": None,
                "neurokit2": None,
                "note": (
                    "Generation environment had numpy+scipy only (no mne / "
                    "neurokit2 available); HRV oracles are the plain-numpy "
                    "references in oracle_common.py, which implement the "
                    "canonical MeanNN/SDNN/RMSSD formulas. requirements.txt "
                    "lists the full canonical oracle set for future "
                    "regeneration."
                ),
            },
            "inputQuantization": (
                "all sample arrays are float32-quantized before the float64 "
                "oracle runs, so committed inputs are exact in both pipelines"
            ),
            "seeds": {
                "eeg.seeded_noise": 42,
                "eeg.alpha_bump_on_noise": 1234,
                "eeg.no_alpha_noise": 1234,
                "pulse.clean_gaussian": 7,
                "pulse.with_ectopics": 21,
                "pulse.with_out_of_range": 99,
                "stats.seeded_normal": 123,
                "stats.with_outliers": 456,
            },
            "tolerances": {
                "eeg/welch_psd.json": {"rtol": 1e-3, "atolRelToMax": 1e-6},
                "eeg/band_powers.json": {"rtol": 1e-3, "atol": 1e-9},
                "eeg/spectral_entropy.json": {"rtol": 1e-3},
                "eeg/alpha_peak.json": {"atolHz": 0.25},
                "eeg/hjorth.json": {"rtol": 1e-4},
                "eeg/quality_flags.json": {
                    "fractionsAtol": 1e-4,
                    "lineNoiseRtol": 1e-3,
                },
                "pulse/hrv_time_domain.json": {"atolMs": 0.5},
                "stats/robust_summary.json": {"rtol": 1e-4, "atol": 1e-9},
            },
            "files": [
                "eeg/welch_psd.json",
                "eeg/band_powers.json",
                "eeg/spectral_entropy.json",
                "eeg/alpha_peak.json",
                "eeg/hjorth.json",
                "eeg/quality_flags.json",
                "pulse/hrv_time_domain.json",
                "stats/robust_summary.json",
            ],
        },
    )


if __name__ == "__main__":
    main()
