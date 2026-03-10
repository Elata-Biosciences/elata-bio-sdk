import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  { file: 'wasm/eeg_wasm.js', minSize: 100 },
  { file: 'wasm/eeg_wasm.d.ts', minSize: 50 },
  { file: 'wasm/eeg_wasm_bg.wasm', minSize: 1024 },
  { file: 'wasm/eeg_wasm_bg.wasm.d.ts', minSize: 50 },
];

let failed = false;
for (const { file, minSize } of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error(`WASM verification failed: ${file} not found`);
    failed = true;
    continue;
  }
  const size = fs.statSync(full).size;
  if (size < minSize) {
    console.error(`WASM verification failed: ${file} is ${size} bytes (min: ${minSize})`);
    failed = true;
  }
}

if (failed) {
  console.error('\nRun "./run.sh build eeg" to generate WASM artifacts.');
  process.exit(2);
}
console.log('WASM verification passed: all artifacts present and non-trivial.');
