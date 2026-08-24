"""Generate pulse/HRV golden fixtures (hrv_time_domain@1 + nn_clean@1).

The full-environment oracle for HRV would be NeuroKit2's `nk.hrv_time`; the
frozen generation environment for this fixture set had numpy/scipy only (see
fixtures/manifest.json), so the oracle is the plain-numpy reference in
oracle_common.py — the same formulas NeuroKit2 uses for MeanNN/SDNN/RMSSD over
an already-cleaned NN series.
"""

from __future__ import annotations

import numpy as np

from oracle_common import hrv_time_domain, write_fixture


def cases() -> dict:
    rng = np.random.default_rng(7)
    clean = np.clip(rng.normal(800.0, 40.0, 240), 600.0, 1100.0)

    rng2 = np.random.default_rng(21)
    base = np.clip(rng2.normal(820.0, 35.0, 180), 620.0, 1080.0)
    with_ectopics = base.copy()
    # Simulated ectopic beats: short interval followed by a compensatory pause.
    for position, (short, long) in zip(
        (20, 75, 130), ((400.0, 1250.0), (390.0, 1300.0), (410.0, 1240.0))
    ):
        with_ectopics[position] = short
        with_ectopics[position + 1] = long

    rng3 = np.random.default_rng(99)
    with_out_of_range = np.clip(rng3.normal(780.0, 30.0, 120), 640.0, 1000.0)
    with_out_of_range[10] = 150.0  # sensor glitch, below physiologic range
    with_out_of_range[60] = 2500.0  # dropout gap, above physiologic range
    with_out_of_range[100] = 40.0

    return {
        "clean_gaussian": [float(v) for v in clean],
        "with_ectopics": [float(v) for v in with_ectopics],
        "with_out_of_range": [float(v) for v in with_out_of_range],
        "too_few_intervals": [800.0],
        "all_out_of_range": [100.0, 150.0, 2600.0],
        "empty": [],
    }


def main() -> None:
    write_fixture(
        "pulse/hrv_time_domain.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "hrv_time_domain@1",
            "oracle": {
                "lib": "numpy",
                "note": (
                    "plain-numpy reference (canonical NeuroKit2 formulas); "
                    "cleaning = nn_clean@1 range [300,2000]ms then +/-30% of "
                    "in-range median, order preserved"
                ),
            },
            "tolerances": {"atolMs": 0.5},
            "cases": [
                {
                    "name": name,
                    "input": {"ibisMs": ibis},
                    "expected": hrv_time_domain(ibis),
                }
                for name, ibis in cases().items()
            ],
        },
    )


if __name__ == "__main__":
    main()
