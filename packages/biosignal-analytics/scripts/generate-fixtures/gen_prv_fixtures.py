"""Generate the extended pulse-rate-variability golden fixtures
(prv_time_domain@1, prv_frequency_domain@1).

Companion to gen_pulse_fixtures.py, which pins the three shared time-domain
metrics (meanNN/SDNN/RMSSD) under their original hrv_time_domain@1 identity.
This script covers everything added on top — SDSD, pNN20, pNN50, Poincare
SD1/SD2 — plus the frequency-domain bands, and it uses the PRV naming because
Elata's intervals come from a camera (peak-to-peak, not R-to-R).

Oracles: the plain-numpy canonical formulas in oracle_common.py for the time
domain (identical to NeuroKit2's `hrv_time` / `hrv_nonlinear` definitions), and
`scipy.signal.welch` over an `np.interp`-resampled tachogram for the frequency
domain. Neither reads the Rust implementation.
"""

from __future__ import annotations

import numpy as np

from oracle_common import prv_frequency_domain, prv_time_domain, write_fixture


def time_domain_cases() -> dict:
    """Reuses the gen_pulse_fixtures.py inputs (same seeds, so the shared
    metrics stay cross-checkable between the two files) plus interval counts
    that sit exactly on the >=2 / >=3 gates."""
    rng = np.random.default_rng(7)
    clean = np.clip(rng.normal(800.0, 40.0, 240), 600.0, 1100.0)

    rng2 = np.random.default_rng(21)
    base = np.clip(rng2.normal(820.0, 35.0, 180), 620.0, 1080.0)
    with_ectopics = base.copy()
    for position, (short, long) in zip(
        (20, 75, 130), ((400.0, 1250.0), (390.0, 1300.0), (410.0, 1240.0))
    ):
        with_ectopics[position] = short
        with_ectopics[position + 1] = long

    rng3 = np.random.default_rng(99)
    with_out_of_range = np.clip(rng3.normal(780.0, 30.0, 120), 640.0, 1000.0)
    with_out_of_range[10] = 150.0
    with_out_of_range[60] = 2500.0
    with_out_of_range[100] = 40.0

    # A metronomic series: every successive difference is 0, so RMSSD, SDSD,
    # both pNN values and SD1 must all be exactly 0 while SD2 = sqrt(2)*SDNN.
    metronome = [800.0] * 12

    # Alternating +/-60 ms: every |diff| exceeds both pNN thresholds, so
    # pNN20 = pNN50 = 100.
    alternating = [770.0 if i % 2 == 0 else 890.0 for i in range(21)]

    return {
        "clean_gaussian": [float(v) for v in clean],
        "with_ectopics": [float(v) for v in with_ectopics],
        "with_out_of_range": [float(v) for v in with_out_of_range],
        "metronome_zero_variability": metronome,
        "alternating_large_swings": alternating,
        "three_intervals": [800.0, 850.0, 810.0],
        "two_intervals": [800.0, 850.0],
        "one_interval": [800.0],
        "all_out_of_range": [100.0, 150.0, 2600.0],
        "empty": [],
    }


def _modulated_series(
    duration_s: float,
    mean_nn_ms: float,
    lf_amplitude_ms: float,
    lf_hz: float,
    hf_amplitude_ms: float,
    hf_hz: float,
    noise_ms: float,
    seed: int,
) -> list:
    """Beat-driven synthesis: each interval is sampled at the beat that starts
    it, so the modulation lands at real elapsed time rather than beat index."""
    rng = np.random.default_rng(seed)
    intervals = []
    t = 0.0
    while t < duration_s:
        nn = (
            mean_nn_ms
            + lf_amplitude_ms * np.sin(2.0 * np.pi * lf_hz * t)
            + hf_amplitude_ms * np.sin(2.0 * np.pi * hf_hz * t)
            + rng.normal(0.0, noise_ms)
        )
        nn = float(np.clip(nn, 400.0, 1600.0))
        intervals.append(nn)
        t += nn / 1000.0
    return intervals


def frequency_domain_cases() -> dict:
    return {
        # 5 minutes: both bands resolvable. LF (0.1 Hz) is deliberately twice
        # the HF (0.25 Hz) amplitude, so LF:HF must come out well above 1.
        "resting_5min_lf_dominant": _modulated_series(
            300.0, 850.0, 40.0, 0.10, 12.0, 0.25, 6.0, 11
        ),
        # 5 minutes with the amplitudes swapped -> LF:HF below 1.
        "resting_5min_hf_dominant": _modulated_series(
            300.0, 850.0, 10.0, 0.10, 45.0, 0.25, 6.0, 12
        ),
        # 90 s: long enough for HF, too short for LF -> LF and the ratio are
        # withheld, HF is reported.
        "ninety_seconds_hf_only": _modulated_series(
            90.0, 800.0, 30.0, 0.10, 25.0, 0.25, 5.0, 13
        ),
        # 40 s: neither band resolvable.
        "forty_seconds_none": _modulated_series(
            40.0, 800.0, 30.0, 0.10, 25.0, 0.25, 5.0, 14
        ),
        # Under the interval-count floor.
        "too_few_intervals": [800.0] * 10,
        "empty": [],
    }


def main() -> None:
    write_fixture(
        "pulse/prv_time_domain.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "prv_time_domain@1 + nn_clean@1",
            "oracle": {
                "lib": "numpy",
                "note": (
                    "plain-numpy canonical formulas (the NeuroKit2 hrv_time / "
                    "hrv_nonlinear definitions) over the nn_clean@1 output. "
                    "meanNN/SDNN/RMSSD duplicate hrv_time_domain@1 by "
                    "construction; SDSD/pNN20/pNN50/SD1/SD2 are the extension. "
                    "PRV, not HRV: these intervals are camera peak-to-peak."
                ),
            },
            "tolerances": {"atolMs": 0.5, "atolPercent": 1e-9, "rtol": 1e-9},
            "cases": [
                {
                    "name": name,
                    "input": {"ibisMs": ibis},
                    "expected": prv_time_domain(ibis),
                }
                for name, ibis in time_domain_cases().items()
            ],
        },
    )

    write_fixture(
        "pulse/prv_frequency_domain.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "prv_frequency_domain@1 + nn_clean@1",
            "oracle": {
                "lib": "scipy",
                "note": (
                    "np.interp linear resampling of the NN tachogram onto a "
                    "4 Hz grid, then scipy.signal.welch (hann, 50% overlap, "
                    "constant detrend, one-sided density, nfft = "
                    "next_pow2(nperseg)) and rectangular band integration with "
                    "right-exclusive edges. Withholding gates: >=20 cleaned "
                    "intervals, >=120 s for LF, >=60 s for HF, and a Welch "
                    "segment spanning >=2 cycles of the band's low edge."
                ),
            },
            # Measured Rust-vs-scipy agreement is ~2.6e-7, set by the f32
            # windowing inside the shared welch_psd@1; 1e-5 leaves ~40x
            # headroom while still being tight enough to catch a real change.
            "tolerances": {"rtol": 1e-5, "atolMs2": 1e-9, "ratioRtol": 1e-5},
            "cases": [
                {
                    "name": name,
                    "input": {"ibisMs": ibis},
                    "expected": prv_frequency_domain(ibis),
                }
                for name, ibis in frequency_domain_cases().items()
            ],
        },
    )


if __name__ == "__main__":
    main()
