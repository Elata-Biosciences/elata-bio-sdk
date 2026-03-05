#!/usr/bin/env node

/**
 * Validates npm pack --dry-run output for all three packages.
 * Ensures tarballs contain expected files and no test/dev artifacts leak.
 *
 * Usage: node scripts/validate-tarballs.mjs
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const packages = [
  {
    name: '@elata/rppg-web',
    dir: 'packages/rppg-web',
    requiredFiles: ['dist/index.js', 'dist/index.d.ts', 'README.md', 'package.json'],
    forbiddenPatterns: ['__tests__', '.test.ts', '.test.js', 'node_modules/', 'tsconfig', 'jest.config', 'coverage/', 'demo/', 'scripts/'],
  },
  {
    name: '@elata/eeg-web',
    dir: 'packages/eeg-web',
    requiredFiles: ['dist/index.js', 'dist/index.d.ts', 'README.md', 'package.json', 'wasm/eeg_wasm.js', 'wasm/eeg_wasm.d.ts', 'wasm/eeg_wasm_bg.wasm', 'wasm/eeg_wasm_bg.wasm.d.ts'],
    forbiddenPatterns: ['__tests__', '.test.ts', '.test.js', 'node_modules/', 'tsconfig', 'jest.config', 'coverage/', 'wasm/.gitkeep'],
  },
  {
    name: '@elata/eeg-web-ble',
    dir: 'packages/eeg-web-ble',
    requiredFiles: ['dist/index.js', 'dist/index.d.ts', 'README.md', 'package.json'],
    forbiddenPatterns: ['__tests__', '.test.ts', '.test.js', 'node_modules/', 'tsconfig', 'jest.config', 'coverage/', 'scripts/'],
  },
];

let totalErrors = 0;

for (const pkg of packages) {
  const pkgDir = path.join(root, pkg.dir);
  console.log(`\n--- Validating ${pkg.name} ---`);

  let output;
  try {
    output = execSync('npm pack --dry-run --ignore-scripts 2>&1', {
      cwd: pkgDir,
      encoding: 'utf-8',
      env: { ...process.env, npm_config_cache: process.env.NPM_CONFIG_CACHE || '/tmp/npm-cache' },
    });
  } catch (err) {
    console.error(`  FAIL: npm pack --dry-run failed for ${pkg.name}`);
    console.error(`  ${err.message || err}`);
    totalErrors++;
    continue;
  }

  // Parse file list from npm pack --dry-run output.
  // Lines look like: "npm notice 1.2kB dist/index.js"
  const fileLines = output
    .split('\n')
    .filter(line => line.includes('npm notice') && !line.includes('=') && !line.includes('Tarball'))
    .map(line => {
      const match = line.match(/npm notice\s+[\d.]+[kKmMgG]?B?\s+(.+)/);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean);

  let pkgErrors = 0;

  // Check required files
  for (const required of pkg.requiredFiles) {
    const found = fileLines.some(f => f === required || f.endsWith('/' + required));
    if (!found) {
      console.error(`  MISSING: ${required}`);
      pkgErrors++;
    }
  }

  // Check forbidden patterns
  for (const file of fileLines) {
    for (const pattern of pkg.forbiddenPatterns) {
      if (file.includes(pattern)) {
        console.error(`  LEAKED: ${file} (matches forbidden pattern "${pattern}")`);
        pkgErrors++;
      }
    }
  }

  // Check no .ts source files leaked (only .d.ts and .js should be present)
  for (const file of fileLines) {
    if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      console.error(`  LEAKED: ${file} (TypeScript source file in tarball)`);
      pkgErrors++;
    }
  }

  if (pkgErrors === 0) {
    console.log(`  OK: ${fileLines.length} files, all checks passed`);
  } else {
    console.error(`  ${pkgErrors} error(s) found`);
  }

  totalErrors += pkgErrors;
}

console.log('');
if (totalErrors > 0) {
  console.error(`Tarball validation failed with ${totalErrors} error(s).`);
  process.exit(1);
} else {
  console.log('All tarball validations passed.');
}
