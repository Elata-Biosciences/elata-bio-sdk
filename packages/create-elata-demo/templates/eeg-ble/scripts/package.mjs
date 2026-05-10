#!/usr/bin/env node
/**
 * Packages the Vite build output into a zip file for upload to the Elata App Store.
 * The zip contains index.html at the root — the required upload format.
 */

import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';

const distDir = 'dist';
const zipName = 'app.zip';
const zipPath = resolve(zipName);

if (!existsSync(distDir)) {
  console.error('Error: dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

if (existsSync(zipName)) unlinkSync(zipName);

if (platform() === 'win32') {
  execSync(
    `powershell -Command "Compress-Archive -Path ${distDir}\\* -DestinationPath ${zipName}"`,
    { stdio: 'inherit' },
  );
} else {
  execSync(`cd ${distDir} && zip -r ../${zipName} .`, { stdio: 'inherit', shell: true });
}

console.log(`\nReady to upload: ${zipPath}`);
console.log('Go to the Elata App Store and upload this file to publish your app.\n');
