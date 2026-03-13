/**
 * EEG SDK Demo
 *
 * Demonstrates every major API in @elata-biosciences/eeg-web using
 * simulated EEG data (no hardware required).
 *
 * Functions exercised:
 *   init / get_version
 *   band_powers          — all 5 bands + .relative()
 *   alpha/beta/theta/delta/gamma_power — individual band helpers
 *   custom_band_power    — arbitrary Hz range
 *   compute_power_spectrum + get_fft_frequencies — raw FFT
 *   WasmCalmnessModel    — calmness score, state, alpha/beta ratio
 *   WasmAlphaBumpDetector — relaxed vs alert state detection
 *   WasmAlphaPeakModel   — individual alpha peak frequency + SNR
 */

import init, {
  get_version,
  band_powers,
  alpha_power,
  beta_power,
  theta_power,
  delta_power,
  gamma_power,
  custom_band_power,
  compute_power_spectrum,
  get_fft_frequencies,
  WasmCalmnessModel,
  WasmAlphaBumpDetector,
  WasmAlphaPeakModel,
} from '../../pkg/eeg_wasm.js';
import { SimulatedEegSource } from '../lib/simulatedEegSource.js';

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el(id) {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} not found`);
  return e;
}

function set(id, text) {
  const e = document.getElementById(id);
  if (e) e.textContent = text;
}

function fmt(n, digits = 4) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// ---------------------------------------------------------------------------
// Sample buffer helpers
// ---------------------------------------------------------------------------

const FS = 256;
const N_CHANNELS = 4;
// Keep 4 s of data — enough for all models
const WINDOW_SAMPLES = FS * 4;

// channel-major buffer: channelBufs[ch][sample]
const channelBufs = Array.from({ length: N_CHANNELS }, () => []);

function pushSamples(sampleMajor) {
  for (const row of sampleMajor) {
    for (let ch = 0; ch < N_CHANNELS; ch++) {
      channelBufs[ch].push(row[ch] ?? 0);
      if (channelBufs[ch].length > WINDOW_SAMPLES) {
        channelBufs[ch].splice(0, channelBufs[ch].length - WINDOW_SAMPLES);
      }
    }
  }
}

/** Single channel as Float32Array (channel 0 by default). */
function singleChannel(ch = 0) {
  return Float32Array.from(channelBufs[ch]);
}

/**
 * Interleaved Float32Array for multi-channel models.
 * Format: [s0_ch0, s0_ch1, ..., s1_ch0, s1_ch1, ...]
 */
function interleaved() {
  const len = Math.min(...channelBufs.map((b) => b.length));
  const out = new Float32Array(len * N_CHANNELS);
  for (let s = 0; s < len; s++) {
    for (let ch = 0; ch < N_CHANNELS; ch++) {
      out[s * N_CHANNELS + ch] = channelBufs[ch][channelBufs[ch].length - len + s] ?? 0;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const statusEl = el('eeg-status');

  // 1. Init WASM ---------------------------------------------------------
  statusEl.textContent = 'Initializing WASM…';
  try {
    await init();
    const version = get_version();
    set('sdk-version', version);
    statusEl.textContent = `Ready — SDK ${version}`;
    statusEl.style.color = '#6ee7b7';
  } catch (err) {
    statusEl.textContent = `WASM init failed: ${err}`;
    statusEl.style.color = '#f87171';
    console.error('eeg-demo: WASM init failed', err);
    return;
  }

  // 2. Create stateful models -------------------------------------------
  const calmnessModel = new WasmCalmnessModel(FS, N_CHANNELS);
  const alphaBump = new WasmAlphaBumpDetector(FS, N_CHANNELS);
  const alphaPeak = new WasmAlphaPeakModel(FS, N_CHANNELS);

  console.info('[eeg-demo] Model min_samples:', {
    calmness: calmnessModel.min_samples(),
    alphaBump: alphaBump.min_samples(),
    alphaPeak: alphaPeak.min_samples(),
  });

  // 3. Simulated EEG source ---------------------------------------------
  const source = new SimulatedEegSource();
  let frameCount = 0;

  source.start((frame) => {
    pushSamples(frame.data);
    frameCount++;

    const minLen = Math.min(...channelBufs.map((b) => b.length));
    set('eeg-samples', `${minLen} / ${WINDOW_SAMPLES}`);

    // Need at least 256 samples (1 s) for band power calls
    if (minLen < FS) return;

    const ch0 = singleChannel(0);
    const ilv = interleaved();

    // -- band_powers -----------------------------------------------------
    try {
      const bp = band_powers(ch0, FS);
      const rel = bp.relative();
      set('bp-delta',    fmt(bp.delta));
      set('bp-theta',    fmt(bp.theta));
      set('bp-alpha',    fmt(bp.alpha));
      set('bp-beta',     fmt(bp.beta));
      set('bp-gamma',    fmt(bp.gamma));
      set('bp-total',    fmt(bp.total));
      set('bp-rel-alpha', `${fmt(rel.alpha * 100, 1)} %`);
      set('bp-rel-beta',  `${fmt(rel.beta  * 100, 1)} %`);
      bp.free();
      rel.free();
    } catch (e) {
      console.warn('band_powers failed', e);
    }

    // -- individual band helpers -----------------------------------------
    try {
      set('ind-delta', fmt(delta_power(ch0, FS)));
      set('ind-theta', fmt(theta_power(ch0, FS)));
      set('ind-alpha', fmt(alpha_power(ch0, FS)));
      set('ind-beta',  fmt(beta_power(ch0, FS)));
      set('ind-gamma', fmt(gamma_power(ch0, FS)));
    } catch (e) {
      console.warn('individual band helpers failed', e);
    }

    // -- custom_band_power -----------------------------------------------
    try {
      const mu = custom_band_power(ch0, FS, 8, 12);
      const lowGamma = custom_band_power(ch0, FS, 30, 45);
      set('custom-mu',       fmt(mu));
      set('custom-lowgamma', fmt(lowGamma));
    } catch (e) {
      console.warn('custom_band_power failed', e);
    }

    // -- compute_power_spectrum + get_fft_frequencies -------------------
    try {
      const spectrum = compute_power_spectrum(ch0);
      const freqs    = get_fft_frequencies(ch0.length, FS);
      let peakHz = 0, peakPow = -Infinity;
      for (let i = 0; i < freqs.length; i++) {
        if (freqs[i] > 45) break;
        if (spectrum[i] > peakPow) { peakPow = spectrum[i]; peakHz = freqs[i]; }
      }
      set('fft-bins',   `${spectrum.length}`);
      set('fft-res',    `${fmt(freqs.length > 1 ? freqs[1] - freqs[0] : 0, 3)} Hz/bin`);
      set('fft-peak',   `${fmt(peakHz, 2)} Hz`);
      set('fft-peakpow', fmt(peakPow));
    } catch (e) {
      console.warn('compute_power_spectrum failed', e);
    }

    // -- WasmCalmnessModel -----------------------------------------------
    if (minLen >= calmnessModel.min_samples()) {
      try {
        const cr = calmnessModel.process(ilv);
        if (cr) {
          set('calm-score',   fmt(cr.score, 3));
          set('calm-smooth',  fmt(cr.smoothed_score, 3));
          set('calm-pct',     `${fmt(cr.percentage(), 1)} %`);
          set('calm-state',   cr.state_description());
          set('calm-abratio', fmt(cr.alpha_beta_ratio, 3));
          set('calm-alpha',   fmt(cr.alpha_power));
          set('calm-beta',    fmt(cr.beta_power));
          set('calm-theta',   fmt(cr.theta_power));
          cr.free();
        }
      } catch (e) {
        console.warn('WasmCalmnessModel failed', e);
      }
    }

    // -- WasmAlphaBumpDetector ------------------------------------------
    if (minLen >= alphaBump.min_samples()) {
      try {
        const ar = alphaBump.process(ilv);
        if (ar) {
          set('bump-state',   ar.state);
          set('bump-changed', ar.state_changed ? 'YES' : 'no');
          set('bump-power',   fmt(ar.alpha_power));
          set('bump-baseline',fmt(ar.baseline));
          set('bump-high',    ar.is_high() ? '✓' : '—');
          set('bump-low',     ar.is_low()  ? '✓' : '—');
          ar.free();
        }
      } catch (e) {
        console.warn('WasmAlphaBumpDetector failed', e);
      }
    }

    // -- WasmAlphaPeakModel --------------------------------------------
    if (minLen >= alphaPeak.min_samples()) {
      try {
        const pr = alphaPeak.process(ilv);
        if (pr) {
          set('peak-freq',    `${fmt(pr.peak_frequency, 2)} Hz`);
          set('peak-smooth',  `${fmt(pr.smoothed_peak_frequency, 2)} Hz`);
          set('peak-longterm',`${fmt(pr.long_term_peak_frequency, 2)} Hz`);
          set('peak-power',   fmt(pr.peak_power));
          set('peak-snr',     fmt(pr.snr, 3));
          pr.free();
        }
      } catch (e) {
        console.warn('WasmAlphaPeakModel failed', e);
      }
    }

    // Heartbeat indicator
    if (frameCount % 8 === 0) {
      const dot = el('eeg-dot');
      dot.style.opacity = dot.style.opacity === '1' ? '0.3' : '1';
    }
  });
}

window.addEventListener('load', main);
