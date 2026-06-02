//! Score the elata-rppg estimator on the shared benchmark fixtures produced by
//! TradeLock's generator, emitting a metrics report in the same JSON shape as
//! the TS runner so the two can be compared side by side.
//!
//! Usage:
//!   cargo run -p elata-rppg --example fixture_benchmark -- <fixtures.json> <out-metrics.json>
//!
//! The SDK's flagship method (HarmonicWithPrior — prior-backed harmonic
//! selection over the periodogram) represents the "elata-sdk" column.

use std::collections::BTreeMap;
use std::time::Instant;

use elata_rppg::benchmark::{estimate_bpm, EstimationMethod};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    scenario: String,
    true_bpm: f32,
    sample_rate: f32,
    signal: Vec<f32>,
}

#[derive(Deserialize)]
struct Fixtures {
    cases: Vec<Case>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Metrics {
    count: usize,
    mae: f32,
    rmse: f32,
    within1_bpm_pct: f32,
    within2_bpm_pct: f32,
    within5_bpm_pct: f32,
    octave_error_pct: f32,
}

#[derive(Serialize)]
struct Hrv {
    // The SDK does not emit HRV/RMSSD; left empty so the report shows "—".
    methods: BTreeMap<String, Option<f32>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Perf {
    mean_ms_per_window: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    pipeline: String,
    schema: String,
    overall: Metrics,
    by_scenario: BTreeMap<String, Metrics>,
    hrv: Hrv,
    perf: Perf,
}

fn metrics_of(pairs: &[(f32, f32)]) -> Metrics {
    let n = pairs.len();
    if n == 0 {
        return Metrics {
            count: 0,
            mae: 0.0,
            rmse: 0.0,
            within1_bpm_pct: 0.0,
            within2_bpm_pct: 0.0,
            within5_bpm_pct: 0.0,
            octave_error_pct: 0.0,
        };
    }
    let mut sum_abs = 0.0f32;
    let mut sum_sq = 0.0f32;
    let (mut w1, mut w2, mut w5, mut oct) = (0usize, 0usize, 0usize, 0usize);
    for &(t, est) in pairs {
        let err = (est - t).abs();
        sum_abs += err;
        sum_sq += err * err;
        if err <= 1.0 {
            w1 += 1;
        }
        if err <= 2.0 {
            w2 += 1;
        }
        if err <= 5.0 {
            w5 += 1;
        }
        let ratio = if t > 0.0 { est / t } else { 0.0 };
        if (ratio - 0.5).abs() < 0.15 || (ratio - 2.0).abs() < 0.15 {
            oct += 1;
        }
    }
    let nf = n as f32;
    Metrics {
        count: n,
        mae: sum_abs / nf,
        rmse: (sum_sq / nf).sqrt(),
        within1_bpm_pct: 100.0 * w1 as f32 / nf,
        within2_bpm_pct: 100.0 * w2 as f32 / nf,
        within5_bpm_pct: 100.0 * w5 as f32 / nf,
        octave_error_pct: 100.0 * oct as f32 / nf,
    }
}

fn main() {
    let mut args = std::env::args().skip(1);
    let fixtures_path = args.next().unwrap_or_else(|| "bench/rppg-fixtures.json".to_string());
    let out_path = args.next().unwrap_or_else(|| "bench/elata-sdk-metrics.json".to_string());

    let raw = std::fs::read_to_string(&fixtures_path)
        .unwrap_or_else(|e| panic!("failed to read {fixtures_path}: {e}"));
    let fixtures: Fixtures = serde_json::from_str(&raw).expect("invalid fixtures JSON");

    let mut all: Vec<(f32, f32)> = Vec::new();
    let mut by_scenario: BTreeMap<String, Vec<(f32, f32)>> = BTreeMap::new();
    let mut total_ms = 0.0f64;
    let mut timed = 0usize;

    for c in &fixtures.cases {
        let est = estimate_bpm(&c.signal, c.sample_rate, EstimationMethod::HarmonicWithPrior, None);
        // Match the TS runner: a null estimate is scored as a worst-plausible
        // band edge so abstaining can't game the metrics.
        let est_bpm = est.unwrap_or(if c.true_bpm < 90.0 { 180.0 } else { 40.0 });
        all.push((c.true_bpm, est_bpm));
        by_scenario.entry(c.scenario.clone()).or_default().push((c.true_bpm, est_bpm));

        let start = Instant::now();
        let repeats = 3;
        for _ in 0..repeats {
            let _ = estimate_bpm(&c.signal, c.sample_rate, EstimationMethod::HarmonicWithPrior, None);
        }
        total_ms += start.elapsed().as_secs_f64() * 1000.0 / repeats as f64;
        timed += 1;
    }

    let report = Report {
        pipeline: "elata-sdk".to_string(),
        schema: "rppg-benchmark-metrics.v1".to_string(),
        overall: metrics_of(&all),
        by_scenario: by_scenario.iter().map(|(k, v)| (k.clone(), metrics_of(v))).collect(),
        hrv: Hrv { methods: BTreeMap::new() },
        perf: Perf { mean_ms_per_window: if timed > 0 { total_ms / timed as f64 } else { 0.0 } },
    };

    let json = serde_json::to_string_pretty(&report).expect("serialize report");
    if let Some(dir) = std::path::Path::new(&out_path).parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    std::fs::write(&out_path, json).unwrap_or_else(|e| panic!("failed to write {out_path}: {e}"));

    println!(
        "elata-sdk: MAE {:.2} bpm | within-5 {:.0}% | octave-err {:.0}% -> {}",
        report.overall.mae, report.overall.within5_bpm_pct, report.overall.octave_error_pct, out_path
    );
}
