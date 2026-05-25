#!/usr/bin/env node
/**
 * Packages the iframe app (game.html + its assets) into app.zip for upload to
 * the Elata App Store. The appstore expects index.html at the zip root, so we
 * copy dist/game.html → app/index.html and rewrite the script tag accordingly.
 *
 * The host shell (dist/index.html) is dev-only and is not included.
 */

import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { platform } from 'node:os';
import { resolve, join } from 'node:path';

const distDir = 'dist';
const stageDir = 'app';
const zipName = 'app.zip';

if (!existsSync(distDir)) {
  console.error('Error: dist/ not found. Run "npm run build" first.');
  process.exit(1);
}
if (!existsSync(join(distDir, 'game.html'))) {
  console.error('Error: dist/game.html not found. Run "npm run build" first.');
  process.exit(1);
}

// Stage a fresh directory that mirrors the iframe app only.
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir);

// Copy everything except the dev host shell entry.
cpSync(distDir, stageDir, {
  recursive: true,
  filter: (src) => !src.endsWith(`${distDir}/index.html`),
});

// The appstore upload root must be named index.html.
const gameHtml = readFileSync(join(stageDir, 'game.html'), 'utf8');
writeFileSync(join(stageDir, 'index.html'), gameHtml);
rmSync(join(stageDir, 'game.html'));

if (existsSync(zipName)) rmSync(zipName);

if (platform() === 'win32') {
  execSync(
    `powershell -Command "Compress-Archive -Path ${stageDir}\\* -DestinationPath ${zipName}"`,
    { stdio: 'inherit' },
  );
} else {
  execSync(`cd ${stageDir} && zip -r ../${zipName} .`, {
    stdio: 'inherit',
    shell: true,
  });
}

rmSync(stageDir, { recursive: true, force: true });

console.log(`Created ${resolve(zipName)}`);
