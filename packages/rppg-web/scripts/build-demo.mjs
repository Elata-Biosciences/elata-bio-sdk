#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const outDir = path.resolve(packageRoot, 'demo', 'pkg');
const wasmPath = path.resolve(repoRoot, 'target', 'wasm32-unknown-unknown', 'release', 'rppg_wasm.wasm');

const mode = (process.argv[2] || 'all').toLowerCase();

function run(cmd, args, cwd = repoRoot) {
  const full = `${cmd} ${args.join(' ')}`;
  console.log(`[rppg-web] ${full}`);
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (res.error) {
    if (res.error && res.error.code === 'ENOENT') {
      throw new Error(`Missing command '${cmd}'. Install it and retry.`);
    }
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${full}`);
  }
}

function hasCommand(cmd) {
  const res = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return !res.error && res.status === 0;
}

function ensureEsbuildInstalled() {
  if (existsSync(path.resolve(packageRoot, 'pnpm-lock.yaml')) && hasCommand('pnpm')) {
    run('pnpm', ['install', '--prod=false'], packageRoot);
    return;
  }
  run('npm', ['install', '--include=dev'], packageRoot);
}

function buildWasm() {
  mkdirSync(outDir, { recursive: true });
  run('rustup', ['target', 'add', 'wasm32-unknown-unknown']);
  run('cargo', ['build', '-p', 'rppg-wasm', '--target', 'wasm32-unknown-unknown', '--release']);
  if (!existsSync(wasmPath)) {
    throw new Error(`Built wasm not found at ${wasmPath}`);
  }
  if (!hasCommand('wasm-bindgen')) {
    run('cargo', ['install', '-f', 'wasm-bindgen-cli']);
  }
  run('wasm-bindgen', [wasmPath, '--out-dir', outDir, '--target', 'web']);
}

async function bundleDemo() {
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch (initialErr) {
    console.log("[rppg-web] 'esbuild' unavailable, attempting dependency install...");
    ensureEsbuildInstalled();
    try {
      esbuild = await import('esbuild');
    } catch (retryErr) {
      const reason = retryErr instanceof Error ? retryErr.message : String(retryErr);
      const initialReason = initialErr instanceof Error ? initialErr.message : String(initialErr);
      throw new Error(
        "Missing 'esbuild' dependency after install attempt. " +
          "Run 'pnpm --dir packages/rppg-web install --prod=false' (or npm install --include=dev) and retry. " +
          `Initial error: ${initialReason}. Retry error: ${reason}`
      );
    }
  }
  console.log('[rppg-web] esbuild demo/main.ts -> demo/demo.js');
  await esbuild.build({
    absWorkingDir: packageRoot,
    entryPoints: ['demo/main.ts'],
    bundle: true,
    format: 'esm',
    outfile: 'demo/demo.js',
    sourcemap: false,
  });
}

function usage() {
  console.log('Usage: node scripts/build-demo.mjs <all|wasm|bundle>');
}

try {
  if (mode === 'all') {
    buildWasm();
    await bundleDemo();
  } else if (mode === 'wasm') {
    buildWasm();
  } else if (mode === 'bundle') {
    await bundleDemo();
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`[rppg-web] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
