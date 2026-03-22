# DS004514 Variant-Routed Baseline Report

- Config: `configs\cross_modal\ds004514_variant_routed_baseline.toml`
- Runtime seconds: `4.046`
- Peak memory MB: `777.426`

## Aggregate

- Routed variants: `2`
- Total train windows: `360`
- Total eval windows: `360`
- Weighted model MSE: `0.000026`
- Weighted null MSE: `0.000000`
- Weighted MSE ratio vs null: `10103.039947`
- Weighted model corr: `-0.083513`
- Weighted null corr: `-0.004413`

## Per-Variant

### variant28

- Train windows: `180`
- Eval windows: `180`
- EEG shape: `[64, 1229]`
- fNIRS shape: `[28, 78]`
- Alignment RMSE (s): `0.037039`
- Model MSE: `0.000040`
- Null MSE: `0.000000`
- MSE ratio vs null: `14914.660056`
- Model corr: `-0.033317`
- Null corr: `0.016379`
- Beats null MSE: `False`

### variant22

- Train windows: `180`
- Eval windows: `180`
- EEG shape: `[64, 1229]`
- fNIRS shape: `[22, 89]`
- Alignment RMSE (s): `0.032431`
- Model MSE: `0.000012`
- Null MSE: `0.000000`
- MSE ratio vs null: `4833.634216`
- Model corr: `-0.133709`
- Null corr: `-0.025205`
- Beats null MSE: `False`

## Interpretation

- This routed baseline is currently an executable negative control, not a winning cross-subject model.
- The fact that it underperforms the null on held-out subjects is itself informative for planning.
