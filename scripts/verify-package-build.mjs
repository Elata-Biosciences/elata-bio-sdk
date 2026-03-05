#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/verify-package-build.mjs <file> [file2 ...]');
  process.exit(1);
}

const root = process.cwd();
const missing = files.filter((file) => !fs.existsSync(path.join(root, file)));

if (missing.length > 0) {
  for (const file of missing) {
    console.error(`Build verification failed: ${file} not found`);
  }
  process.exit(2);
}

console.log(`Build verification passed: ${files.join(', ')} exist`);
