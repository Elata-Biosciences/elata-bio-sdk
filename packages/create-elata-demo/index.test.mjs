import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'index.mjs');
const scaffolderPackage = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8'),
);
const eegWebVersion = JSON.parse(
  readFileSync(join(__dirname, '..', 'eeg-web', 'package.json'), 'utf8'),
).version;
const eegWebBleVersion = JSON.parse(
  readFileSync(join(__dirname, '..', 'eeg-web-ble', 'package.json'), 'utf8'),
).version;
const rppgWebVersion = JSON.parse(
  readFileSync(join(__dirname, '..', 'rppg-web', 'package.json'), 'utf8'),
).version;

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
  assert.match(result.stdout, /aliases: rppg/);
  assert.match(result.stdout, /eeg-web-demo/);
  assert.match(result.stdout, /eeg-web-ble-demo/);
});

test('ships fallback SDK versions that match the repo package versions', () => {
  assert.equal(scaffolderPackage.elataSdkVersions.eegWeb, eegWebVersion);
  assert.equal(scaffolderPackage.elataSdkVersions.eegWebBle, eegWebBleVersion);
  assert.equal(scaffolderPackage.elataSdkVersions.rppgWeb, rppgWebVersion);
});

test('scaffolds the default template', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-'));
  try {
    const result = runCli(['demo-app'], tmp);
    assert.strictEqual(result.status, 0, `CLI failed:\n${result.stderr}`);
    assert.ok(existsSync(join(tmp, 'demo-app', 'package.json')));
    assert.ok(existsSync(join(tmp, 'demo-app', 'README.md')));
    assert.ok(existsSync(join(tmp, 'demo-app', 'src', 'App.tsx')));
    const pkg = readFileSync(join(tmp, 'demo-app', 'package.json'), 'utf8');
    const app = readFileSync(join(tmp, 'demo-app', 'src', 'App.tsx'), 'utf8');
    assert.match(pkg, new RegExp(`"@elata-biosciences/rppg-web": "${rppgWebVersion}"`));
    assert.match(app, /createRppgSession/);
    assert.match(app, /Session diagnostics/);
    assert.match(app, /backendMode/);
    assert.match(app, /lastError/);
    assert.match(app, /processorIssues/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('scaffolds correctly from packaged contents without monorepo siblings', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-packaged-'));
  try {
    const packagedDir = join(tmp, 'pkg');
    mkdirSync(packagedDir);
    cpSync(join(__dirname, 'index.mjs'), join(packagedDir, 'index.mjs'));
    cpSync(join(__dirname, 'package.json'), join(packagedDir, 'package.json'));
    cpSync(join(__dirname, 'templates'), join(packagedDir, 'templates'), {
      recursive: true,
    });

    const result = spawnSync(process.execPath, [join(packagedDir, 'index.mjs'), 'demo-app'], {
      cwd: tmp,
      encoding: 'utf8',
      timeout: 10_000,
    });

    assert.strictEqual(result.status, 0, `CLI failed:\n${result.stderr}`);
    const pkg = readFileSync(join(tmp, 'demo-app', 'package.json'), 'utf8');
    assert.match(pkg, new RegExp(`"@elata-biosciences/rppg-web": "${rppgWebVersion}"`));
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
      assert.ok(existsSync(join(appDir, 'README.md')));

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
    assert.match(pkg, new RegExp(`"@elata-biosciences/eeg-web": "${eegWebVersion}"`));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('scaffolds the BLE template with current package versions', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-'));
  try {
    const result = runCli(['ble-demo', '--template', 'eeg-web-ble-demo'], tmp);
    assert.strictEqual(result.status, 0, `CLI failed:\n${result.stderr}`);
    const pkg = readFileSync(join(tmp, 'ble-demo', 'package.json'), 'utf8');
    assert.match(pkg, new RegExp(`"@elata-biosciences/eeg-web": "${eegWebVersion}"`));
    assert.match(
      pkg,
      new RegExp(`"@elata-biosciences/eeg-web-ble": "${eegWebBleVersion}"`),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('warns when scaffolding inside a parent pnpm workspace', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-workspace-'));
  try {
    const workspaceDir = join(tmp, 'workspace');
    mkdirSync(workspaceDir);
    writeFileSync(join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');

    const result = runCli(['nested-demo'], workspaceDir);
    assert.strictEqual(result.status, 0, `CLI failed:\n${result.stderr}`);
    assert.match(result.stdout, /inside an existing pnpm workspace/);
    assert.match(result.stdout, /--ignore-workspace install/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('accepts a short template alias', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'create-elata-demo-'));
  try {
    const result = runCli(['brain-demo', '--template', 'eeg'], tmp);
    assert.strictEqual(result.status, 0, `CLI failed:\n${result.stderr}`);
    const pkg = readFileSync(join(tmp, 'brain-demo', 'package.json'), 'utf8');
    assert.match(pkg, new RegExp(`"@elata-biosciences/eeg-web": "${eegWebVersion}"`));
    assert.doesNotMatch(pkg, /@elata-biosciences\/eeg-web-ble/);
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
