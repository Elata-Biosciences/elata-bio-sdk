/**
 * Basic EEG stream example.
 *
 * Shows the minimal setup to connect a Muse-compatible headband, receive EEG
 * frames, compute band powers, and get a calmness score.
 *
 * Packages required:
 *   npm install @elata-biosciences/eeg-web @elata-biosciences/eeg-web-ble
 *
 * Requirements:
 *   - Chrome or Edge (Web Bluetooth)
 *   - https:// or localhost
 *   - Muse 2, Muse S, or compatible headband
 */

import {
  AthenaWasmDecoder,
  WasmCalmnessModel,
  band_powers,
  initEegWasm,
} from "@elata-biosciences/eeg-web";
import { BleTransport } from "@elata-biosciences/eeg-web-ble";

// Safe to call multiple times — only initialises the WASM module once.
await initEegWasm();

const transport = new BleTransport({
  deviceOptions: {
    // AthenaWasmDecoder lives in eeg-web but is required by eeg-web-ble as a
    // peer dep. Import it from eeg-web and pass a factory here.
    athenaDecoderFactory: () => new AthenaWasmDecoder(),
  },
});

// WasmCalmnessModel requires channelCount, which is only known after the first
// frame arrives — construct it lazily.
let calmnessModel: WasmCalmnessModel | null = null;

transport.onFrame = (frame) => {
  const { samples, sampleRateHz, channelCount } = frame.eeg;
  // samples layout: [channelIdx][sampleIdx]

  // Use band_powers() for a per-frame, per-channel frequency breakdown.
  // Use WasmCalmnessModel (below) if you want a smoothed, multi-channel score.
  // `using` ensures .free() is called on WASM-owned objects at block end.
  // Requires `"lib": ["ES2022", "ES2022.Disposable"]` (or "esnext.disposable")
  // in tsconfig.json. Alternatively call .free() manually.
  const ch0 = new Float32Array(samples[0]);
  using powers = band_powers(ch0, sampleRateHz);
  using rel = powers.relative();
  console.log("alpha", rel.alpha.toFixed(3));

  // Calmness score — takes interleaved multi-channel data.
  // Returns undefined during warm-up (~2s at 256 Hz, see min_samples()).
  // Show a "calibrating…" state in your UI until the first result arrives.
  if (!calmnessModel) {
    calmnessModel = new WasmCalmnessModel(sampleRateHz, channelCount);
  }

  const nSamples = samples[0].length;
  const interleaved = new Float32Array(nSamples * channelCount);
  for (let s = 0; s < nSamples; s++) {
    for (let c = 0; c < channelCount; c++) {
      interleaved[s * channelCount + c] = samples[c][s];
    }
  }

  using result = calmnessModel.process(interleaved);
  if (result) {
    // smoothed_score: 0.0 = alert, 1.0 = very calm
    console.log("calmness", result.state_description(), result.smoothed_score.toFixed(2));
  }
};

transport.onStatus = (status) => {
  console.log("status", status.state, status.reason ?? "");
};

// startStreaming() handles connect() + start() in one call.
// If BLE is already connected (e.g. after a stop()), it skips re-pairing.
await transport.startStreaming();
