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

function runCommand(cmd, args, cwd, timeoutMs = 5 * 60_000) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    timeout: timeoutMs,
  });

  if (result.error) {
    throw result.error;
  }

  assert.strictEqual(
    result.status,
    0,
    `Command failed: ${cmd} ${args.join(' ')}`,
  );
}

test('lists templates', () => {
  const result = runCli(['--list-templates'], __dirname);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(result.stdout, /rppg-web-demo/);
  assert.match(result.stdout, /eeg-web-demo/);
  assert.match(result.stdout, /eeg-web-ble-demo/);
});

test('scaffolds the default template', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-'));
  try {
    const result = runCli(['demo-app'], tmp);
    assert.strictEqual(result.status, 0, `CLI failed:\n${result.stderr}`);
    assert.ok(existsSync(join(tmp, 'demo-app', 'package.json')));
    assert.ok(existsSync(join(tmp, 'demo-app', 'src', 'App.tsx')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('smoke: each template scaffolds, installs, and builds', () => {
  const templates = ['rppg-web-demo', 'eeg-web-demo', 'eeg-web-ble-demo'];

  for (const templateName of templates) {
    const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-smoke-'));
    const appName = `demo-${templateName}`;
    const appDir = join(tmp, appName);

    try {
      const result = runCli([appName, '--template', templateName], tmp);
      assert.strictEqual(
        result.status,
        0,
        `CLI failed for ${templateName}:\n${result.stderr}`,
      );
      assert.ok(existsSync(join(appDir, 'package.json')));

      runCommand('pnpm', ['install'], appDir);
      runCommand('pnpm', ['run', 'build'], appDir);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test('scaffolds a selected EEG template', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-'));
  try {
    const result = runCli(['brain-demo', '--template', 'eeg-web-demo'], tmp);
    assert.strictEqual(result.status, 0, `CLI failed:\n${result.stderr}`);
    const pkg = readFileSync(join(tmp, 'brain-demo', 'package.json'), 'utf8');
    assert.match(pkg, /@elata-biosciences\/eeg-web/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('fails on unknown template', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-'));
  try {
    const result = runCli(['bad-demo', '--template', 'missing-template'], tmp);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /unknown template/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
