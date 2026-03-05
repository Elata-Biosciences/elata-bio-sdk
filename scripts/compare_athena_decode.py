#!/usr/bin/env python3
"""
Compare Athena EEG decode between OpenMuse (Python) and muse-proto (Rust).

Usage:
  python scripts/compare_athena_decode.py --in path\\to\\log.tsv

This will:
  1) Run OpenMuse decode on the log
  2) Run the Rust decoder (athena_decode) to CSV
  3) Compare sample-by-sample for EEG channels
"""

import argparse
import csv
import os
import subprocess
import sys
from pathlib import Path


def load_openmuse_eeg_with_keys(log_path: Path):
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))
    import OpenMuse.decode as om_decode  # noqa: E402

    with log_path.open("r", encoding="utf-8") as f:
        messages = [line for line in f if line.strip()]

    rows = {}
    for message in messages:
        parsed = om_decode.parse_message(message)
        eeg_list = parsed.get("EEG", [])
        for subpkt in eeg_list:
            data = subpkt.get("data")
            if data is None or data.size == 0:
                continue
            pkt_time_raw = subpkt.get("pkt_time_raw")
            pkt_index = subpkt.get("pkt_index")
            n_samples = subpkt.get("n_samples", data.shape[0])
            n_channels = subpkt.get("n_channels", data.shape[1] if data.ndim > 1 else 1)
            for sample_idx in range(n_samples):
                subpkt_index = subpkt.get("subpkt_index")
                subpkt_key = int(subpkt_index) if subpkt_index is not None else -1
                key = (int(pkt_time_raw), int(pkt_index), subpkt_key, int(sample_idx))
                row = []
                for ch in range(8):
                    if ch < n_channels:
                        row.append(float(data[sample_idx, ch]))
                    else:
                        row.append(0.0)
                rows[key] = row
    return rows


def load_openmuse_accgyro_with_keys(log_path: Path):
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))
    import OpenMuse.decode as om_decode  # noqa: E402

    with log_path.open("r", encoding="utf-8") as f:
        messages = [line for line in f if line.strip()]

    rows = {}
    for message in messages:
        parsed = om_decode.parse_message(message)
        acc_list = parsed.get("ACCGYRO", [])
        for subpkt in acc_list:
            data = subpkt.get("data")
            if data is None or data.size == 0:
                continue
            pkt_time_raw = subpkt.get("pkt_time_raw")
            pkt_index = subpkt.get("pkt_index")
            subpkt_index = subpkt.get("subpkt_index")
            subpkt_key = int(subpkt_index) if subpkt_index is not None else -1
            n_samples = subpkt.get("n_samples", data.shape[0])
            for sample_idx in range(n_samples):
                key = (int(pkt_time_raw), int(pkt_index), subpkt_key, int(sample_idx))
                rows[key] = [float(v) for v in data[sample_idx, :6]]
    return rows


def load_openmuse_optics_with_keys(log_path: Path):
    repo_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(repo_root))
    import OpenMuse.decode as om_decode  # noqa: E402

    with log_path.open("r", encoding="utf-8") as f:
        messages = [line for line in f if line.strip()]

    rows = {}
    for message in messages:
        parsed = om_decode.parse_message(message)
        opt_list = parsed.get("OPTICS", [])
        for subpkt in opt_list:
            data = subpkt.get("data")
            if data is None or data.size == 0:
                continue
            pkt_time_raw = subpkt.get("pkt_time_raw")
            pkt_index = subpkt.get("pkt_index")
            subpkt_index = subpkt.get("subpkt_index")
            subpkt_key = int(subpkt_index) if subpkt_index is not None else -1
            n_samples = subpkt.get("n_samples", data.shape[0])
            n_channels = subpkt.get("n_channels", data.shape[1] if data.ndim > 1 else 1)
            for sample_idx in range(n_samples):
                key = (int(pkt_time_raw), int(pkt_index), subpkt_key, int(sample_idx))
                row = []
                for ch in range(16):
                    if ch < n_channels:
                        row.append(float(data[sample_idx, ch]))
                    else:
                        row.append(0.0)
                rows[key] = row
    return rows


def load_rust_eeg_with_keys(csv_path: Path):
    rows = {}
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.reader(f)
        in_section = False
        for row in reader:
            if not row:
                continue
            if row[0].startswith("sample_index"):
                in_section = True
                continue
            if row[0].startswith("accgyro_sample_index") or row[0].startswith("optics_sample_index"):
                break
            if not in_section:
                continue
            if row[1] == "pkt_time_raw":
                continue
            pkt_time_raw = int(row[1])
            pkt_index = int(row[2])
            subpkt_index = int(row[3])
            sample_in_packet = int(row[4])
            values = [float(v) for v in row[-8:]]
            key = (pkt_time_raw, pkt_index, subpkt_index, sample_in_packet)
            rows[key] = values
    return rows


def load_rust_accgyro_with_keys(csv_path: Path):
    rows = {}
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if row and row[0].startswith("accgyro_sample_index"):
                break
        for row in reader:
            if not row:
                continue
            if row[0].startswith("optics_sample_index"):
                break
            pkt_time_raw = int(row[1])
            pkt_index = int(row[2])
            subpkt_index = int(row[3])
            sample_in_packet = int(row[4])
            values = [float(v) for v in row[-6:]]
            key = (pkt_time_raw, pkt_index, subpkt_index, sample_in_packet)
            rows[key] = values
    return rows


def load_rust_optics_with_keys(csv_path: Path):
    rows = {}
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.reader(f)
        found = False
        for row in reader:
            if row and row[0].startswith("optics_sample_index"):
                found = True
                break
        if not found:
            return rows
        for row in reader:
            if not row:
                continue
            pkt_time_raw = int(row[1])
            pkt_index = int(row[2])
            subpkt_index = int(row[3])
            sample_in_packet = int(row[4])
            values = [float(v) for v in row[-16:]]
            key = (pkt_time_raw, pkt_index, subpkt_index, sample_in_packet)
            rows[key] = values
    return rows


def find_repo_root(start: Path) -> Path:
    cur = start.resolve()
    if cur.is_file():
        cur = cur.parent
    while True:
        if (cur / "Cargo.toml").exists():
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    raise FileNotFoundError("Could not locate Cargo.toml in parent directories.")


def run_rust_decoder(log_path: Path, out_path: Path):
    repo_root = find_repo_root(log_path)
    cmd = [
        "cargo",
        "run",
        "-p",
        "muse-proto",
        "--bin",
        "athena_decode",
        "--",
        "--in",
        str(log_path),
        "--out",
        str(out_path),
    ]
    subprocess.check_call(cmd, cwd=repo_root)


def compare_series_by_key(a, b, max_diff=1e-3, max_report=20):
    keys = sorted(set(a.keys()) & set(b.keys()))
    diffs = []
    for key in keys:
        av = a[key]
        bv = b[key]
        for ch in range(min(len(av), len(bv))):
            d = abs(av[ch] - bv[ch])
            if d > max_diff:
                diffs.append((key, ch, av[ch], bv[ch], d))
                if len(diffs) >= max_report:
                    return len(keys), diffs
    return len(keys), diffs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="log_path", required=True, help="Path to log.tsv")
    args = parser.parse_args()

    log_path = Path(args.log_path).resolve()
    if not log_path.exists():
        raise SystemExit(f"Input not found: {log_path}")

    print("Decoding with OpenMuse...")
    om_eeg = load_openmuse_eeg_with_keys(log_path)
    om_acc = load_openmuse_accgyro_with_keys(log_path)
    om_opt = load_openmuse_optics_with_keys(log_path)
    print(f"OpenMuse EEG samples: {len(om_eeg)}")
    print(f"OpenMuse ACCGYRO samples: {len(om_acc)}")
    print(f"OpenMuse OPTICS samples: {len(om_opt)}")

    rust_out = log_path.with_suffix(".rust_eeg.csv")
    print("Decoding with muse-proto (Rust)...")
    run_rust_decoder(log_path, rust_out)
    rust_eeg = load_rust_eeg_with_keys(rust_out)
    rust_acc = load_rust_accgyro_with_keys(rust_out)
    rust_opt = load_rust_optics_with_keys(rust_out)
    print(f"Rust EEG samples: {len(rust_eeg)}")
    print(f"Rust ACCGYRO samples: {len(rust_acc)}")
    print(f"Rust OPTICS samples: {len(rust_opt)}")

    n, diffs = compare_series_by_key(om_eeg, rust_eeg)
    print(f"EEG compared {n} samples.")
    if diffs:
        print(f"EEG diffs > 1e-3: {len(diffs)}")
        for key, ch, a, b, d in diffs:
            pkt_time_raw, pkt_index, subpkt_index, sample_in_packet = key
            print(
                f"  pkt_time_raw={pkt_time_raw} pkt_index={pkt_index} subpkt={subpkt_index} sample={sample_in_packet} "
                f"ch{ch}: openmuse={a:.4f} rust={b:.4f} diff={d:.4f}"
            )
    else:
        print("EEG OK: No diffs above threshold.")

    n, diffs = compare_series_by_key(om_acc, rust_acc)
    print(f"ACCGYRO compared {n} samples.")
    if diffs:
        print(f"ACCGYRO diffs > 1e-3: {len(diffs)}")
        for key, ch, a, b, d in diffs[:20]:
            pkt_time_raw, pkt_index, subpkt_index, sample_in_packet = key
            print(
                f"  pkt_time_raw={pkt_time_raw} pkt_index={pkt_index} subpkt={subpkt_index} sample={sample_in_packet} "
                f"ch{ch}: openmuse={a:.6f} rust={b:.6f} diff={d:.6f}"
            )
    else:
        print("ACCGYRO OK: No diffs above threshold.")

    n, diffs = compare_series_by_key(om_opt, rust_opt)
    print(f"OPTICS compared {n} samples.")
    if diffs:
        print(f"OPTICS diffs > 1e-3: {len(diffs)}")
        for key, ch, a, b, d in diffs[:20]:
            pkt_time_raw, pkt_index, subpkt_index, sample_in_packet = key
            print(
                f"  pkt_time_raw={pkt_time_raw} pkt_index={pkt_index} subpkt={subpkt_index} sample={sample_in_packet} "
                f"ch{ch}: openmuse={a:.6f} rust={b:.6f} diff={d:.6f}"
            )
    else:
        print("OPTICS OK: No diffs above threshold.")


if __name__ == "__main__":
    main()
