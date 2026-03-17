import { useState } from 'react';
import { band_powers, initEegWasm } from '@elata-biosciences/eeg-web';

function createSyntheticWindow(sampleRate: number, seconds: number) {
  const sampleCount = sampleRate * seconds;
  const values = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    values[i] = Math.sin(2 * Math.PI * 10 * t) + 0.35 * Math.sin(2 * Math.PI * 22 * t);
  }
  return values;
}

export default function App() {
  const [status, setStatus] = useState('Ready');
  const [alpha, setAlpha] = useState<number | null>(null);
  const [beta, setBeta] = useState<number | null>(null);

  async function runAnalysis() {
    setStatus('Initializing WASM...');
    await initEegWasm();
    const samples = createSyntheticWindow(256, 4);
    const result = band_powers(samples, 256);
    setAlpha(result.alpha);
    setBeta(result.beta);
    setStatus('Computed power bands from synthetic EEG.');
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Elata EEG Web Demo</h1>
      <p>This starter runs the EEG WASM package in the browser and computes basic band powers.</p>
      <button type="button" onClick={runAnalysis}>
        Run analysis
      </button>
      <p>{status}</p>
      <div>Alpha: {alpha != null ? alpha.toFixed(4) : '--'}</div>
      <div>Beta: {beta != null ? beta.toFixed(4) : '--'}</div>
    </main>
  );
}
