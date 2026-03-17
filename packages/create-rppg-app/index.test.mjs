import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'index.mjs');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
}

test('scaffolds project with expected files', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-rppg-app-'));
  try {
    const result = runCli(['my-app'], tmp);
    assert.strictEqual(result.status, 0, `CLI failed:\n${result.stderr}`);
    assert.ok(existsSync(join(tmp, 'my-app', 'package.json')));
    assert.ok(existsSync(join(tmp, 'my-app', 'index.html')));
    assert.ok(existsSync(join(tmp, 'my-app', 'src', 'App.tsx')));
    assert.ok(existsSync(join(tmp, 'my-app', 'src', 'main.tsx')));
    assert.ok(existsSync(join(tmp, 'my-app', 'vite.config.ts')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('replaces __APP_NAME__ in package.json', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-rppg-app-'));
  try {
    runCli(['heart-demo'], tmp);
    const pkg = readFileSync(join(tmp, 'heart-demo', 'package.json'), 'utf8');
    assert.ok(pkg.includes('heart-demo'), 'package.json should contain the project name');
    assert.ok(!pkg.includes('__APP_NAME__'), 'package.json should not contain __APP_NAME__');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('renames _gitignore to .gitignore', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-rppg-app-'));
  try {
    runCli(['my-app'], tmp);
    assert.ok(existsSync(join(tmp, 'my-app', '.gitignore')), '.gitignore should exist');
    assert.ok(!existsSync(join(tmp, 'my-app', '_gitignore')), '_gitignore should be renamed');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('exits non-zero when no project name supplied', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-rppg-app-'));
  try {
    const result = spawnSync(process.execPath, [CLI], {
      cwd: tmp,
      encoding: 'utf8',
      input: '\n', // answer empty string to the readline prompt
      timeout: 5_000,
    });
    assert.notStrictEqual(result.status, 0, 'Should exit with non-zero when name is empty');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('exits non-zero when target directory already exists', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-rppg-app-'));
  try {
    runCli(['existing-app'], tmp);
    const result = runCli(['existing-app'], tmp);
    assert.notStrictEqual(result.status, 0, 'Should fail when dir already exists');
    assert.ok(result.stderr.includes('already exists'), `stderr: ${result.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
