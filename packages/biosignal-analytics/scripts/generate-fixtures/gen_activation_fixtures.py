"""Generate the activation-epoch golden fixture (activation_epoch@1).

`activation_epoch@1` is a bespoke contract rather than a textbook transform, so
the fixture pins it two ways:

1. `expected` — the numpy reference in oracle_common.activation_epoch, written
   from the documented contract and never from the Rust output.
2. `analytic` (the `piecewise_linear_trapezoid` case only) — every metric
   worked out in closed form from the piecewise-linear definition below, so the
   numpy reference itself is checkable by hand. The Rust test asserts against
   BOTH blocks; if the two ever disagree, the fixture is wrong, not the code.

The input series are derived per-window feature values (float64), not raw
sensor samples, so unlike the EEG fixtures they are not float32-quantized. All
analytic-case amplitudes are multiples of 0.25 and therefore exact in binary
floating point.
"""

from __future__ import annotations

import numpy as np

from oracle_common import activation_epoch, write_fixture

SAMPLE_RATE_HZ = 1.0


def trapezoid_series() -> list:
    """Baseline 10.0 for t < 100; linear rise +1.0/s over t = 100..140 to a
    peak of 50.0; plateau at 50.0 through t = 180; linear decay -0.25/s back to
    10.0 at t = 340; flat 10.0 through t = 399."""
    values = []
    for t in range(400):
        if t <= 100:
            values.append(10.0)
        elif t <= 140:
            values.append(10.0 + float(t - 100))
        elif t <= 180:
            values.append(50.0)
        elif t <= 340:
            values.append(50.0 - 0.25 * float(t - 180))
        else:
            values.append(10.0)
    return values


TRAPEZOID_ANALYTIC = {
    "note": (
        "Baseline is exactly flat, so MAD = 0, scale = 0 and the threshold "
        "collapses onto the baseline level of 10.0; onset is therefore the "
        "first sample strictly above 10.0 (t = 101) and the epoch runs until "
        "the decay reaches 10.0 (last above-threshold sample t = 339)."
    ),
    "baselineLevel": 10.0,
    "baselineScale": 0.0,
    "activationThreshold": 10.0,
    "startSeconds": 101.0,
    "endSeconds": 339.0,
    "peakValue": 50.0,
    "peakSeconds": 140.0,
    "timeToPeakSeconds": 39.0,
    # (peak - level) / (tPeak - tPreOnset) = 40 / (140 - 100).
    "riseRatePerSecond": 1.0,
    # Trapezoid rule over t = 101..339 of (value - 10):
    #   rise    sum(1..40)                       = 820
    #   plateau 40 * 40                          = 1600
    #   decay   sum(40 - 0.25k for k = 1..159)   = 3180
    #   trapz   = 5600 - (first + last) / 2 = 5600 - (1 + 0.25) / 2
    "areaAboveBaseline": 5599.375,
    # half target 10 + 0.5*40 = 30 reached at t = 260; baseline target
    # 10 + 0.1*40 = 14 reached at t = 324; both measured from the peak.
    "halfRecoveryTarget": 30.0,
    "baselineReturnTarget": 14.0,
    "timeToHalfRecoverySeconds": 120.0,
    "timeToBaselineSeconds": 184.0,
    "recoveryCompleted": True,
    # (14 - 50) / (324 - 140)
    "recoverySlopePerSecond": -36.0 / 184.0,
    "residualFraction": 0.0,
}


def gaussian_activation(seed: int) -> list:
    """Noisy baseline with a smooth 60 s bump — the realistic shape."""
    rng = np.random.default_rng(seed)
    t = np.arange(360, dtype=np.float64)
    bump = 8.0 * np.exp(-0.5 * ((t - 170.0) / 25.0) ** 2)
    return [float(v) for v in 10.0 + bump + rng.normal(0.0, 0.35, t.size)]


def flat_noise(seed: int, n: int = 400) -> list:
    rng = np.random.default_rng(seed)
    return [float(v) for v in rng.normal(10.0, 1.0, n)]


def brief_spike(seed: int) -> list:
    """A 5 s excursion — above threshold but under the 10 s sustain floor."""
    values = np.asarray(flat_noise(seed), dtype=np.float64)
    values[200:205] += 20.0
    return [float(v) for v in values]


def two_activations() -> list:
    """Two qualifying runs; only the first may be reported."""
    values = []
    for t in range(400):
        if 100 <= t < 140:
            values.append(30.0)
        elif 250 <= t < 320:
            values.append(45.0)
        else:
            values.append(10.0)
    return values


def plateau_to_the_end() -> list:
    """Rises and stays up: recovery is observable but never completes."""
    values = []
    for t in range(200):
        if t <= 100:
            values.append(10.0)
        elif t <= 140:
            values.append(10.0 + float(t - 100))
        else:
            values.append(50.0)
    return values


def peak_at_recording_end() -> list:
    """Peaks 4 s before the recording stops: the recovery block is withheld."""
    values = []
    for t in range(155):
        if t <= 100:
            values.append(10.0)
        elif t <= 150:
            values.append(10.0 + 0.8 * float(t - 100))
        else:
            values.append(50.0)
    return values


def cases() -> list:
    return [
        ("piecewise_linear_trapezoid", trapezoid_series()),
        ("gaussian_activation_on_noise", gaussian_activation(31)),
        ("flat_noise_no_activation", flat_noise(41)),
        ("brief_spike_below_sustain_floor", brief_spike(51)),
        ("two_activations_first_wins", two_activations()),
        ("plateau_never_recovers", plateau_to_the_end()),
        ("peak_at_recording_end", peak_at_recording_end()),
        ("baseline_too_short", [10.0] * 15),
        ("single_sample", [10.0]),
        ("empty", []),
    ]


def main() -> None:
    payload_cases = []
    for name, values in cases():
        case = {
            "name": name,
            "input": {"values": values, "sampleRateHz": SAMPLE_RATE_HZ},
            "expected": activation_epoch(values, SAMPLE_RATE_HZ),
        }
        if name == "piecewise_linear_trapezoid":
            case["analytic"] = TRAPEZOID_ANALYTIC
        payload_cases.append(case)

    write_fixture(
        "activation/activation_epoch.json",
        {
            "schema": "elata.golden-fixture/v1",
            "algorithm": "activation_epoch@1",
            "oracle": {
                "lib": "numpy",
                "note": (
                    "numpy reference implementation of the documented "
                    "activation_epoch@1 contract (oracle_common.py), plus a "
                    "closed-form `analytic` block on the piecewise-linear case "
                    "so the reference itself is independently checkable. "
                    "Defaults: baselineWindow 60 s, minBaseline 20 s, k = 2 "
                    "robust MAD units, minSustained 10 s, minRecovery 10 s, "
                    "recoveryFraction 0.10."
                ),
            },
            "tolerances": {"rtol": 1e-9, "atol": 1e-9, "atolSeconds": 1e-9},
            "cases": payload_cases,
        },
    )


if __name__ == "__main__":
    main()
