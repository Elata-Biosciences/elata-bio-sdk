# DS006848 PPG Quality Review

Config: `configs/cross_modal/ds006848_ppg_quality_review.toml`

## Overview

- subjects reviewed: 12
- sampled windows: 1536
- quality-pass windows: 1509
- dominant-beat-valid windows: 1526
- notch-valid windows: 131

## Highest composite-quality subjects

- sub-012: current_tier=default_train_eval, quality_pass_rate=1.000, dominant_beat_valid_rate=1.000, median_clean_std=0.002374, median_amplitude_range=0.007840
- sub-002: current_tier=pending_review, quality_pass_rate=1.000, dominant_beat_valid_rate=0.961, median_clean_std=0.001687, median_amplitude_range=0.005411
- sub-015: current_tier=default_train_eval, quality_pass_rate=1.000, dominant_beat_valid_rate=1.000, median_clean_std=0.001420, median_amplitude_range=0.004550
- sub-013: current_tier=default_train_eval, quality_pass_rate=1.000, dominant_beat_valid_rate=1.000, median_clean_std=0.000736, median_amplitude_range=0.002482

## Lowest composite-quality subjects

- sub-035: current_tier=pending_review, quality_pass_rate=1.000, dominant_beat_valid_rate=0.992, median_clean_std=0.000803, median_amplitude_range=0.002667, concerns=none
- sub-016: current_tier=stress_test_only, quality_pass_rate=0.930, dominant_beat_valid_rate=1.000, median_clean_std=0.000217, median_amplitude_range=0.000663, concerns=median_ppg_clean_std_bottom_quartile, median_amplitude_range_bottom_quartile
- sub-025: current_tier=pending_review, quality_pass_rate=1.000, dominant_beat_valid_rate=0.984, median_clean_std=0.000297, median_amplitude_range=0.000925, concerns=median_amplitude_range_bottom_quartile
- sub-017: current_tier=borderline_review, quality_pass_rate=0.859, dominant_beat_valid_rate=1.000, median_clean_std=0.000198, median_amplitude_range=0.000625, concerns=quality_pass_rate_lt_0p90, median_ppg_clean_std_bottom_quartile, median_amplitude_range_bottom_quartile

## Notes

- This review uses task-verbalwm only, because that task spans the full 30-subject DS006848 cohort.
- The subset intentionally mixes already-reviewed subjects with pending-review subjects to guide future cohort promotion decisions.
- The metrics here describe waveform and morphology quality only; they do not replace the broader model-failure analysis.
