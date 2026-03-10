//! Decode Athena BLE logs (timestamp\tuuid\thex) into CSV for parity checks.

use std::env;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};

use muse_proto::athena::{self, AthenaPacket};

#[derive(Debug)]
struct EegFrameRow {
    pkt_time_raw: u32,
    pkt_index: u8,
    subpkt_index: i16,
    channels: Vec<Vec<f32>>, // channel-major
}

#[derive(Debug)]
struct AccGyroFrameRow {
    pkt_time_raw: u32,
    pkt_index: u8,
    subpkt_index: i16,
    samples: Vec<[f32; 6]>,
}

#[derive(Debug)]
struct OpticsFrameRow {
    pkt_time_raw: u32,
    pkt_index: u8,
    subpkt_index: i16,
    channels: Vec<Vec<f32>>, // channel-major
}

fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, String> {
    let hex = hex.trim();
    if !hex.len().is_multiple_of(2) {
        return Err("hex string has odd length".to_string());
    }
    let mut out = Vec::with_capacity(hex.len() / 2);
    let bytes = hex.as_bytes();
    for i in (0..bytes.len()).step_by(2) {
        let hi = (bytes[i] as char).to_digit(16).ok_or("invalid hex")?;
        let lo = (bytes[i + 1] as char).to_digit(16).ok_or("invalid hex")?;
        out.push(((hi << 4) | lo) as u8);
    }
    Ok(out)
}

fn parse_args() -> Result<(String, Option<String>), String> {
    let mut input = None;
    let mut output = None;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--in" => input = args.next(),
            "--out" => output = args.next(),
            "--help" | "-h" => {
                return Err("Usage: athena_decode --in <log.tsv> [--out <eeg.csv>]".to_string())
            }
            _ => {}
        }
    }
    let input = input.ok_or("missing --in <log.tsv>")?;
    Ok((input, output))
}

fn main() -> Result<(), String> {
    let (input_path, output_path) = parse_args()?;
    let file = File::open(&input_path).map_err(|e| format!("open input: {e}"))?;
    let reader = BufReader::new(file);

    let mut eeg_frames: Vec<EegFrameRow> = Vec::new();
    let mut accgyro_frames: Vec<AccGyroFrameRow> = Vec::new();
    let mut optics_frames: Vec<OpticsFrameRow> = Vec::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("read line: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let _ts = parts.next();
        let _uuid = parts.next();
        let hex = parts.next().unwrap_or("");
        if hex.is_empty() {
            continue;
        }
        let payload = match hex_to_bytes(hex) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };

        let packets = athena::decode_message(&payload);
        for packet in packets {
            match packet {
                AthenaPacket::Eeg(frame) => {
                    eeg_frames.push(EegFrameRow {
                        pkt_time_raw: frame.pkt_time_raw,
                        pkt_index: frame.pkt_index,
                        subpkt_index: frame.subpkt_index.map(|v| v as i16).unwrap_or(-1),
                        channels: frame.channels,
                    });
                }
                AthenaPacket::AccGyro(frame) => {
                    accgyro_frames.push(AccGyroFrameRow {
                        pkt_time_raw: frame.pkt_time_raw,
                        pkt_index: frame.pkt_index,
                        subpkt_index: frame.subpkt_index.map(|v| v as i16).unwrap_or(-1),
                        samples: frame.samples,
                    });
                }
                AthenaPacket::Optics(frame) => {
                    optics_frames.push(OpticsFrameRow {
                        pkt_time_raw: frame.pkt_time_raw,
                        pkt_index: frame.pkt_index,
                        subpkt_index: frame.subpkt_index.map(|v| v as i16).unwrap_or(-1),
                        channels: frame.channels,
                    });
                }
                _ => {}
            }
        }
    }

    eeg_frames.sort_by_key(|f| (f.pkt_time_raw, f.pkt_index));
    accgyro_frames.sort_by_key(|f| (f.pkt_time_raw, f.pkt_index));
    optics_frames.sort_by_key(|f| (f.pkt_time_raw, f.pkt_index));

    let mut out: Box<dyn Write> = if let Some(path) = output_path {
        Box::new(File::create(path).map_err(|e| format!("open output: {e}"))?)
    } else {
        Box::new(io::stdout())
    };

    // EEG Header
    writeln!(
        out,
        "sample_index,pkt_time_raw,pkt_index,subpkt_index,sample_in_packet,ch0,ch1,ch2,ch3,ch4,ch5,ch6,ch7"
    )
    .map_err(|e| format!("write output: {e}"))?;

    let mut global_sample_index: u64 = 0;
    for frame in eeg_frames {
        let channels = frame.channels.len();
        if channels == 0 {
            continue;
        }
        let samples_per_channel = frame.channels[0].len();
        for sample_idx in 0..samples_per_channel {
            write!(
                out,
                "{},{},{},{},{}",
                global_sample_index,
                frame.pkt_time_raw,
                frame.pkt_index,
                frame.subpkt_index,
                sample_idx
            )
            .map_err(|e| format!("write output: {e}"))?;
            for ch in 0..8 {
                let val = if ch < channels {
                    frame.channels[ch].get(sample_idx).copied().unwrap_or(0.0)
                } else {
                    0.0
                };
                write!(out, ",{val}").map_err(|e| format!("write output: {e}"))?;
            }
            writeln!(out).map_err(|e| format!("write output: {e}"))?;
            global_sample_index += 1;
        }
    }

    // ACC/GYRO Header
    writeln!(
        out,
        "accgyro_sample_index,pkt_time_raw,pkt_index,subpkt_index,sample_in_packet,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z"
    )
    .map_err(|e| format!("write output: {e}"))?;

    let mut acc_index: u64 = 0;
    for frame in accgyro_frames {
        for (sample_idx, sample) in frame.samples.iter().enumerate() {
            write!(
                out,
                "{},{},{},{},{}",
                acc_index, frame.pkt_time_raw, frame.pkt_index, frame.subpkt_index, sample_idx
            )
            .map_err(|e| format!("write output: {e}"))?;
            for v in sample {
                write!(out, ",{v}").map_err(|e| format!("write output: {e}"))?;
            }
            writeln!(out).map_err(|e| format!("write output: {e}"))?;
            acc_index += 1;
        }
    }

    // OPTICS Header
    writeln!(
        out,
        "optics_sample_index,pkt_time_raw,pkt_index,subpkt_index,sample_in_packet,ch0,ch1,ch2,ch3,ch4,ch5,ch6,ch7,ch8,ch9,ch10,ch11,ch12,ch13,ch14,ch15"
    )
    .map_err(|e| format!("write output: {e}"))?;

    let mut opt_index: u64 = 0;
    for frame in optics_frames {
        let channels = frame.channels.len();
        if channels == 0 {
            continue;
        }
        let samples_per_channel = frame.channels[0].len();
        for sample_idx in 0..samples_per_channel {
            write!(
                out,
                "{},{},{},{},{}",
                opt_index, frame.pkt_time_raw, frame.pkt_index, frame.subpkt_index, sample_idx
            )
            .map_err(|e| format!("write output: {e}"))?;
            for ch in 0..16 {
                let val = if ch < channels {
                    frame.channels[ch].get(sample_idx).copied().unwrap_or(0.0)
                } else {
                    0.0
                };
                write!(out, ",{val}").map_err(|e| format!("write output: {e}"))?;
            }
            writeln!(out).map_err(|e| format!("write output: {e}"))?;
            opt_index += 1;
        }
    }

    Ok(())
}
