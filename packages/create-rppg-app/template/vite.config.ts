import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// Copies the pre-built WASM files from the rppg-web package into public/pkg/
// so they're served at /pkg/rppg_wasm.js at runtime.
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@elata-biosciences/rppg-web/pkg',
          dest: '.',
        },
      ],
    }),
  ],
  optimizeDeps: {
    exclude: ['@elata-biosciences/rppg-web'],
  },
});
