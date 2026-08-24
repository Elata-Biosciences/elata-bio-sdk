"""Generate EEG golden fixtures (Welch PSD, band powers, spectral entropy,
alpha peak, Hjorth + window stats, quality flags).

Inputs are float32-quantized before the float64 oracle runs, so the committed
sample arrays are exactly representable in both pipelines.
"""

from __future__ import annotations

import numpy as np

from oracle_common import (
    alpha_peak,
    band_powers_from_psd,
    dominant_frequency,
    f32,
    hjorth,
    quality_flags,
    spectral_entropy,
    welch_psd,
    window_stats,
    write_fixture,
)

FS = 256.0
N = 2048


def sine(freq_hz: float, amplitude: float, fs: float = FS, n: int = N) -> np.ndarray:
    t = np.arange(n, dtype=np.float64) / fs
    return amplitude * np.sin(2.0 * np.pi * freq_hz * t)


def signals() -> dict:
    rng = np.random.default_rng(42)
    noise = 10.0 * rng.standard_normal(N)

    rng_bump = np.random.default_rng(1234)
    bump_noise = 3.0 * rng_bump.standard_normal(4096)
    t4096 = np.arange(4096, dtype=np.float64) / FS
    alpha_bump = (
        8.0 * np.sin(2.0 * np.pi * 10.25 * t4096)
        + 1.0 * np.sin(2.0 * np.pi * 3.0 * t4096)
        + 1.0 * np.sin(2.0 * np.pi * 27.0 * t4096)
        + bump_noise
    )
    no_alpha = (
        1.0 * np.sin(2.0 * np.pi * 3.0 * t4096)
        + 1.0 * np.sin(2.0 * np.pi * 27.0 * t4096)
        + bump_noise
    )

    # fs=250 -> nperseg 1000, nfft 1024: exercises the zero-padding path.
    t250 = np.arange(2000, dtype=np.float64) / 250.0
    padded = 15.0 * np.sin(2.0 * np.pi * 11.0 * t250)

    return {
        "sine_alpha_10hz": {"samples": f32(sine(10.0, 20.0)), "sampleRateHz": FS},
        "mixed_three_band": {
            "samples": f32(sine(3.0, 10.0) + sine(10.0, 20.0) + sine(25.0, 5.0)),
            "sampleRateHz": FS,
        },
        "seeded_noise": {"samples": f32(noise), "sampleRateHz": FS},
        "alpha_bump_on_noise": {"samples": f32(alpha_bump), "sampleRateHz": FS},
        "no_alpha_noise": {"samples": f32(no_alpha), "sampleRateHz": FS},
        "padded_fs250": {"samples": f32(padded), "sampleRateHz": 250.0},
    }


def main() -> None:
    cases = signals()
    psds = {
        name: welch_psd(case["samples"], case["sampleRateHz"])
        for name, case in cases.items()
    }

    write_fixture(
        "eeg/welch_psd.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "welch_psd@1",
            "oracle": {"lib": "scipy", "fn": "signal.welch"},
            "tolerances": {"rtol": 1e-3, "atolRelToMax": 1e-6},
            "cases": [
                {
                    "name": name,
                    "input": {
                        "samples": case["samples"],
                        "sampleRateHz": case["sampleRateHz"],
                    },
                    "expected": {"freqsHz": psds[name][0], "psd": psds[name][1]},
                }
                for name, case in cases.items()
            ],
        },
    )

    write_fixture(
        "eeg/band_powers.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "eeg_band_power@2",
            "oracle": {"lib": "numpy over scipy.signal.welch PSD"},
            "tolerances": {"rtol": 1e-3, "atol": 1e-9},
            "cases": [
                {
                    "name": name,
                    "input": {
                        "samples": case["samples"],
                        "sampleRateHz": case["sampleRateHz"],
                    },
                    "expected": band_powers_from_psd(*psds[name]),
                }
                for name, case in cases.items()
            ],
        },
    )

    write_fixture(
        "eeg/spectral_entropy.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "spectral_entropy@1 + dominant_frequency@1",
            "oracle": {"lib": "numpy over scipy.signal.welch PSD"},
            "tolerances": {"rtol": 1e-3},
            "cases": [
                {
                    "name": name,
                    "input": {
                        "samples": case["samples"],
                        "sampleRateHz": case["sampleRateHz"],
                    },
                    "expected": {
                        "spectralEntropy": spectral_entropy(psds[name][1]),
                        "dominantFrequencyHz": dominant_frequency(*psds[name]),
                    },
                }
                for name, case in cases.items()
            ],
        },
    )

    write_fixture(
        "eeg/alpha_peak.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "alpha_peak@2",
            "oracle": {"lib": "scipy", "fn": "signal.find_peaks + peak_prominences"},
            "tolerances": {"atolHz": 0.25},
            "cases": [
                {
                    "name": name,
                    "input": {
                        "samples": case["samples"],
                        "sampleRateHz": case["sampleRateHz"],
                    },
                    "expected": {"alphaPeakHz": alpha_peak(*psds[name])},
                }
                for name, case in cases.items()
            ],
        },
    )

    hjorth_cases = {
        name: cases[name]
        for name in ("sine_alpha_10hz", "mixed_three_band", "seeded_noise")
    }
    write_fixture(
        "eeg/hjorth.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "hjorth@1 + window_stats@1",
            "oracle": {"lib": "numpy"},
            "tolerances": {"rtol": 1e-4},
            "cases": [
                {
                    "name": name,
                    "input": {
                        "samples": case["samples"],
                        "sampleRateHz": case["sampleRateHz"],
                    },
                    "expected": {
                        "hjorth": hjorth(case["samples"]),
                        "windowStats": window_stats(case["samples"]),
                    },
                }
                for name, case in hjorth_cases.items()
            ],
        },
    )

    # Quality signals.
    clean = f32(sine(10.0, 30.0))
    half_flat = np.array(sine(10.0, 30.0))
    half_flat[:1024] = 5.0
    half_flat = f32(half_flat)
    clipped = f32(np.clip(sine(10.0, 800.0), -500.0, 500.0))
    mains = f32(sine(10.0, 5.0) + sine(60.0, 40.0))
    quality_cases = {
        "clean_sine": clean,
        "half_flatline": half_flat,
        "hard_clipped": clipped,
        "mains_dominated": mains,
    }
    write_fixture(
        "eeg/quality_flags.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "eeg_quality_flags@1",
            "oracle": {"lib": "numpy over scipy.signal.welch PSD"},
            "tolerances": {"fractionsAtol": 1e-4, "lineNoiseRtol": 1e-3},
            "cases": [
                {
                    "name": name,
                    "input": {"samples": samples, "sampleRateHz": FS},
                    "expected": quality_flags(samples, *welch_psd(samples, FS)),
                }
                for name, samples in quality_cases.items()
            ],
        },
    )


if __name__ == "__main__":
    main()
