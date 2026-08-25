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
                "pulse.prv_resting_5min_lf_dominant": 11,
                "pulse.prv_resting_5min_hf_dominant": 12,
                "pulse.prv_ninety_seconds_hf_only": 13,
                "pulse.prv_forty_seconds_none": 14,
                "activation.gaussian_activation_on_noise": 31,
                "activation.flat_noise_no_activation": 41,
                "activation.brief_spike_below_sustain_floor": 51,
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
                "pulse/prv_time_domain.json": {
                    "atolMs": 0.5,
                    "atolPercent": 1e-9,
                    "rtol": 1e-9,
                },
                # Looser than the time domain on purpose: the frequency-domain
                # path runs the tachogram through an FFT, and the Rust Welch
                # windows in f32 while scipy stays in f64. Measured agreement
                # is ~2.6e-7; 1e-5 leaves ~40x headroom.
                "pulse/prv_frequency_domain.json": {
                    "rtol": 1e-5,
                    "atolMs2": 1e-9,
                    "ratioRtol": 1e-5,
                },
                "activation/activation_epoch.json": {
                    "rtol": 1e-9,
                    "atol": 1e-9,
                    "atolSeconds": 1e-9,
                },
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
                "pulse/prv_time_domain.json",
                "pulse/prv_frequency_domain.json",
                "activation/activation_epoch.json",
                "stats/robust_summary.json",
                "insights/score-fixtures.json",
            ],
            "notes": {
                "insights/score-fixtures.json": (
                    "Headline-score cases generated from this package's own "
                    "compiled dist/insights (scripts/generate-score-fixtures."
                    "mjs), not from a Python oracle — the formulas are "
                    "product composites, not numerical algorithms with an "
                    "external reference. Shared verbatim with the App Store's "
                    "mirrored implementation; regenerate and land in BOTH "
                    "repos when a formula changes."
                ),
                "activation/activation_epoch.json": (
                    "Input series are derived per-window feature values "
                    "(float64), not raw sensor samples, so they are not "
                    "float32-quantized. The piecewise_linear_trapezoid case "
                    "additionally carries an `analytic` block with every "
                    "metric in closed form, so the numpy oracle is itself "
                    "checkable by hand."
                ),
            },
        },
    )


if __name__ == "__main__":
    main()
