//! Benchmark runner for harmonic selection and HR estimation algorithms.
//!
//! Run with: cargo run --example benchmark
//!
//! This runs a comprehensive benchmark suite comparing different estimation
//! methods against synthetic signals with known ground truth.

use rppg::benchmark::{
    generate_test_suite, run_benchmark, run_comparison_benchmark, BenchmarkCase, BenchmarkMetrics,
    EstimationMethod,
};
use rppg::dsp::HarmonicPrior;

fn print_separator() {
    println!("{}", "=".repeat(72));
}

fn print_method_results(method: EstimationMethod, metrics: &BenchmarkMetrics) {
    let method_name = match method {
        EstimationMethod::RawPsdPeak => "Raw PSD Peak",
        EstimationMethod::Cepstrum => "Cepstrum",
        EstimationMethod::HarmonicSum => "Harmonic Sum",
        EstimationMethod::HarmonicWithPrior => "Harmonic + Prior",
        EstimationMethod::CombinedCheck => "Combined Check",
    };

    println!(
        "{:<20} | MAE: {:>6.2} | RMSE: {:>6.2} | <1bpm: {:>5.1}% | <5bpm: {:>5.1}% | Octave Err: {:>5.1}%",
        method_name,
        metrics.mae,
        metrics.rmse,
        metrics.within_1_bpm_pct,
        metrics.within_5_bpm_pct,
        metrics.octave_error_pct
    );
}

fn main() {
    println!();
    print_separator();
    println!("     HARMONIC SELECTION BENCHMARK SUITE");
    println!("     Heart Rate Estimation Algorithm Comparison");
    print_separator();
    println!();

    // Generate the full test suite
    let test_cases = generate_test_suite();
    println!("Test cases: {}", test_cases.len());
    println!();

    // Run comparison across all methods
    println!("OVERALL RESULTS");
    print_separator();
    println!(
        "{:<20} | {:>10} | {:>10} | {:>10} | {:>10} | {:>10}",
        "Method", "MAE (BPM)", "RMSE", "<1 BPM", "<5 BPM", "Oct. Err"
    );
    println!("{}", "-".repeat(72));

    let results = run_comparison_benchmark(&test_cases);
    for (method, metrics) in &results {
        print_method_results(*method, metrics);
    }

    println!();
    print_separator();
    println!();

    // Detailed breakdown by test category
    println!("BREAKDOWN BY TEST CATEGORY");
    print_separator();

    let categories: &[(&str, fn(&BenchmarkCase) -> bool)] = &[
        ("Clean Signals", |c| c.name.starts_with("clean_")),
        ("Realistic Signals", |c| c.name.starts_with("realistic_")),
        ("Highly Realistic (HRV+Resp)", |c| {
            c.name.starts_with("highly_realistic")
        }),
        ("Challenging (All Artifacts)", |c| {
            c.name.starts_with("challenging_")
        }),
        ("Strong 2nd Harmonic", |c| c.name.starts_with("strong_2nd")),
        ("Motion Artifacts", |c| c.name.starts_with("motion_")),
        ("Noisy Signals", |c| c.name.starts_with("noisy_")),
        ("High HRV Stress", |c| c.name.starts_with("high_hrv_")),
        ("Respiratory Interference", |c| {
            c.name.starts_with("resp_interference")
        }),
        ("Edge Cases (Low/High HR)", |c| c.name.contains("_hr_")),
    ];

    let all_methods = [
        ("Raw PSD Peak", EstimationMethod::RawPsdPeak),
        ("Cepstrum", EstimationMethod::Cepstrum),
        ("Harmonic Sum", EstimationMethod::HarmonicSum),
        ("Harmonic + Prior", EstimationMethod::HarmonicWithPrior),
        ("Combined Check", EstimationMethod::CombinedCheck),
    ];

    for (category_name, filter_fn) in categories {
        let filtered: Vec<_> = test_cases
            .iter()
            .filter(|c| filter_fn(c))
            .cloned()
            .collect();
        if filtered.is_empty() {
            continue;
        }

        println!();
        println!("{} (n={})", category_name, filtered.len());
        println!("{}", "-".repeat(72));

        for (method_name, method) in &all_methods {
            let metrics = run_benchmark(&filtered, *method, None);
            println!(
                "  {:<18}: MAE={:>5.2}, <5bpm={:>5.1}%, Octave Err={:>5.1}%",
                method_name, metrics.mae, metrics.within_5_bpm_pct, metrics.octave_error_pct
            );
        }
    }

    println!();
    print_separator();
    println!();

    // Test with different prior configurations
    println!("PRIOR SENSITIVITY ANALYSIS");
    print_separator();

    let priors = [
        ("Default (55-150)", HarmonicPrior::new(55.0, 150.0)),
        ("Narrow (60-100)", HarmonicPrior::new(60.0, 100.0)),
        ("Wide (40-180)", HarmonicPrior::new(40.0, 180.0)),
        ("Athletic (45-90)", HarmonicPrior::new(45.0, 90.0)),
    ];

    for (prior_name, prior) in priors {
        let metrics = run_benchmark(
            &test_cases,
            EstimationMethod::HarmonicWithPrior,
            Some(prior),
        );
        println!(
            "{:<20}: MAE={:.2}, <5bpm={:.1}%, Oct={:.1}%",
            prior_name, metrics.mae, metrics.within_5_bpm_pct, metrics.octave_error_pct
        );
    }

    println!();
    print_separator();
    println!();

    // Show worst cases (highest errors) for multiple methods
    println!("WORST CASES (Largest Errors)");
    print_separator();

    let methods_to_analyze = [
        ("HarmonicWithPrior", EstimationMethod::HarmonicWithPrior),
        ("RawPsdPeak", EstimationMethod::RawPsdPeak),
        ("Cepstrum", EstimationMethod::Cepstrum),
    ];

    for (method_name, method) in methods_to_analyze {
        println!();
        println!("  {} worst cases:", method_name);
        let metrics = run_benchmark(&test_cases, method, None);
        // Pair each result with its original index, then sort by error descending
        let mut worst: Vec<_> = metrics.results.iter().enumerate().collect();
        worst.sort_by(|a, b| b.1.absolute_error.partial_cmp(&a.1.absolute_error).unwrap());

        for (rank, (original_idx, result)) in worst.iter().take(3).enumerate() {
            let case_name = if *original_idx < test_cases.len() {
                &test_cases[*original_idx].name
            } else {
                "unknown"
            };
            println!(
                "    {}. {}: True={:.1}, Est={:.1}, Error={:.1} {}",
                rank + 1,
                case_name,
                result.true_bpm,
                result.estimated_bpm,
                result.absolute_error,
                if result.is_octave_error {
                    "[OCTAVE]"
                } else {
                    ""
                }
            );
        }
    }

    println!();
    print_separator();
    println!("Benchmark complete.");
    println!();
}
