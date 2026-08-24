"""Generate statistics golden fixtures (summary_stats@1, robust_stats@1,
robust_z@1)."""

from __future__ import annotations

import numpy as np

from oracle_common import robust_stats, robust_z, summary_stats, write_fixture


def main() -> None:
    rng = np.random.default_rng(123)
    normal = rng.normal(50.0, 10.0, 500)

    rng2 = np.random.default_rng(456)
    with_outliers = rng2.normal(60.0, 5.0, 200)
    with_outliers[10] = 500.0
    with_outliers[100] = -300.0

    arrays = {
        "seeded_normal": [float(v) for v in normal],
        "with_outliers": [float(v) for v in with_outliers],
        "small_ascending": [1.0, 2.0, 3.0, 4.0, 5.0],
        "single_value": [42.0],
        "constant": [7.0] * 25,
        "empty": [],
    }

    cases = []
    for name, values in arrays.items():
        robust = robust_stats(values)
        probes = []
        if robust["median"] is not None:
            for probe in (
                robust["median"],
                robust["median"] + 5.0,
                robust["median"] - 100.0,
            ):
                probes.append(
                    {
                        "value": probe,
                        "robustZ": robust_z(probe, robust["median"], robust["mad"]),
                    }
                )
        cases.append(
            {
                "name": name,
                "input": {"values": values},
                "expected": {
                    "summary": summary_stats(values),
                    "robust": robust,
                    "robustZProbes": probes,
                },
            }
        )

    write_fixture(
        "stats/robust_summary.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "summary_stats@1 + robust_stats@1 + robust_z@1",
            "oracle": {
                "lib": "numpy",
                "note": (
                    "percentiles: numpy linear interpolation; std/variance "
                    "ddof=1 (null under 2 values); robustZ = (v-median)/"
                    "(1.4826*MAD) clamped to +/-3, 0 when MAD is 0"
                ),
            },
            "tolerances": {"rtol": 1e-4, "atol": 1e-9},
            "cases": cases,
        },
    )


if __name__ == "__main__":
    main()
