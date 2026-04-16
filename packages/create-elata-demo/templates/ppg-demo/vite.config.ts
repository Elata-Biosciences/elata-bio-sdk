import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  optimizeDeps: {
    exclude: [
      '@elata-biosciences/ppg-web',
      '@elata-biosciences/eeg-web',
      '@elata-biosciences/eeg-web-ble',
      '@elata-biosciences/rppg-web',
    ],
  },
});
