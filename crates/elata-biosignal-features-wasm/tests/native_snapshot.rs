//! Writes the NATIVE results of the WASM-exposed analyzers for every golden
//! fixture case, so the real wasm32 build can be diffed against them.
//!
//! Why a file and not a committed fixture: the golden fixtures in
//! `packages/biosignal-analytics/fixtures/` are the correctness oracle and
//! come from Python (numpy/scipy). This snapshot is a different question —
//! do the *two builds of the same Rust* agree? — so generating it from the
//! code under test is exactly right, and committing it would be misleading.
//! It is written into `target/` and read by
//! `packages/biosignal-analytics/src/__tests__/pulseActivation.parity.test.ts`,
//! which skips loudly when it is absent.
//!
//! The snapshot goes through the same `Wasm*Analyzer` types the bindings
//! export (their `cfg(not(target_arch = "wasm32"))` mirror), not the inner
//! crate API, so the boundary's own JSON serialization is part of what is
//! compared.

use biosignal_features_wasm::{WasmActivationEpochAnalyzer, WasmPrvAnalyzer};
use serde_json::{json, Value};

fn fixtures_dir() -> String {
    format!(
        "{}/../../packages/biosignal-analytics/fixtures",
        env!("CARGO_MANIFEST_DIR")
    )
}

fn load_fixture(relative: &str) -> Value {
    let path = format!("{}/{relative}", fixtures_dir());
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read fixture {path}: {e}"));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("invalid fixture JSON {path}: {e}"))
}

fn numbers(value: &Value) -> Vec<f64> {
    value
        .as_array()
        .expect("array")
        .iter()
        .map(|v| v.as_f64().expect("number"))
        .collect()
}

/// Where the TypeScript parity suite looks for the snapshot.
fn snapshot_path() -> String {
    format!(
        "{}/../../target/wasm-native-parity/prv_activation_native.json",
        env!("CARGO_MANIFEST_DIR")
    )
}

#[test]
fn write_native_snapshot_for_wasm_parity() {
    let mut prv = Vec::new();
    for relative in [
        "pulse/prv_time_domain.json",
        "pulse/prv_frequency_domain.json",
    ] {
        let fixture = load_fixture(relative);
        for case in fixture["cases"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let intervals = numbers(&case["input"]["ibisMs"]);
            let mut analyzer = WasmPrvAnalyzer::new(None).expect("default PRV config");
            let result: Value = serde_json::from_str(&analyzer.analyze_intervals(&intervals))
                .expect("PRV payload is valid JSON");
            prv.push(json!({
                "fixture": relative,
                "name": name,
                "intervalsMs": intervals,
                "result": result,
            }));
        }
    }

    let mut activation = Vec::new();
    let fixture = load_fixture("activation/activation_epoch.json");
    for case in fixture["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let values = numbers(&case["input"]["values"]);
        let rate = case["input"]["sampleRateHz"].as_f64().unwrap();
        let mut analyzer =
            WasmActivationEpochAnalyzer::new(rate, None).expect("default activation config");
        let result: Value = serde_json::from_str(&analyzer.analyze_series(&values))
            .expect("activation payload is valid JSON");
        activation.push(json!({
            "name": name,
            "values": values,
            "sampleRateHz": rate,
            "result": result,
        }));
    }

    let payload = json!({
        "schema": "elata.wasm-native-parity-snapshot/v1",
        "note": "Native-build output of the WASM-exposed analyzers. Generated \
                 by cargo test; NOT a correctness oracle — the golden fixtures \
                 are. Consumed by pulseActivation.parity.test.ts to prove the \
                 wasm32 build returns the same numbers.",
        "prv": prv,
        "activation": activation,
    });

    let path = snapshot_path();
    let dir = std::path::Path::new(&path).parent().expect("parent dir");
    std::fs::create_dir_all(dir).expect("create snapshot dir");
    std::fs::write(&path, serde_json::to_string(&payload).expect("serialize"))
        .unwrap_or_else(|e| panic!("cannot write {path}: {e}"));

    // Sanity: the snapshot must actually carry every case, or the TS side
    // would silently compare nothing.
    assert_eq!(prv.len(), 16, "expected every PRV fixture case");
    assert_eq!(
        activation.len(),
        10,
        "expected every activation fixture case"
    );
}
