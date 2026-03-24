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

await initEegWasm();

const transport = new BleTransport({
  deviceOptions: {
    // AthenaWasmDecoder is imported from eeg-web, not eeg-web-ble
    athenaDecoderFactory: () => new AthenaWasmDecoder(),
  },
});

// WasmCalmnessModel requires channelCount, which is only known after the first
// frame arrives — construct it lazily.
let calmnessModel: WasmCalmnessModel | null = null;

transport.onFrame = (frame) => {
  const { samples, sampleRateHz, channelCount } = frame.eeg;
  // samples layout: [channelIdx][sampleIdx]

  // Band powers — takes a single channel as Float32Array
  // `using` ensures .free() is called on WASM-owned objects at block end
  const ch0 = new Float32Array(samples[0]);
  using powers = band_powers(ch0, sampleRateHz);
  using rel = powers.relative();
  console.log("alpha", rel.alpha.toFixed(3));

  // Calmness score — takes interleaved multi-channel data
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

// Both connect() and start() are required — omitting start() produces silence
await transport.connect();
await transport.start();
