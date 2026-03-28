import { useState } from 'react';
import { MuseBleDevice } from '@elata-biosciences/eeg-web-ble';

export default function App() {
  const [device] = useState(() => new MuseBleDevice());
  const [status, setStatus] = useState('Ready to connect');
  const [sampleCount, setSampleCount] = useState(0);
  const [boardName, setBoardName] = useState<string | null>(null);

  async function connectAndStream() {
    try {
      setStatus('Requesting Bluetooth device...');
      await device.prepareSession();
      const info = device.getBoardInfo();
      setBoardName(info.device_name);
      setStatus(`Connected to ${info.device_name}. Starting stream...`);
      await device.startStream((rows) => {
        setSampleCount((current) => current + rows.length);
      });
      setStatus('Streaming EEG samples.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to connect.');
    }
  }

  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Elata EEG Web Bluetooth Demo</h1>
      <p>Connect to a Muse-compatible device from a Chromium-based browser.</p>
      <button type="button" onClick={connectAndStream}>
        Connect device
      </button>
      <p>{status}</p>
      <div>Device: {boardName ?? '--'}</div>
      <div>Samples received: {sampleCount}</div>
    </main>
  );
}
