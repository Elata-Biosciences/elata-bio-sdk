import { test, expect } from '@playwright/test';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function startServer(): ChildProcess {
  const pkgRoot = path.join(__dirname, '..');
  const cmd = 'npx';
  const args = ['http-server', '.', '-p', '8081', '--silent'];
  return spawn(cmd, args, { cwd: pkgRoot, stdio: 'inherit' });
}

test.beforeAll(async () => {
  const root = path.join(__dirname, '..', '..', '..');
  execFileSync(
    'pnpm',
    ['--dir', 'packages/rppg-web', 'run', 'prepare:wasm'],
    { stdio: 'inherit', cwd: root }
  );
  execFileSync(
    'pnpm',
    ['--dir', 'packages/rppg-web', 'run', 'build'],
    { stdio: 'inherit', cwd: root }
  );
});

let server: ChildProcess | null = null;

test.beforeEach(async () => {
  server = startServer();
  await new Promise((resolve) => setTimeout(resolve, 800));
});

test.afterEach(async () => {
  if (server) {
    server.kill();
    server = null;
  }
});

test('consumer browser harness imports dist and loads packaged wasm assets', async ({ page }) => {
  await page.goto('http://localhost:8081/demo/consumer-smoke.html');

  await page.waitForFunction(() => (window as any).__rppg_consumer_smoke !== undefined, null, { timeout: 10000 });
  const result = await page.evaluate(() => (window as any).__rppg_consumer_smoke);

  expect(result.error).toBeUndefined();
  expect(result.importOk).toBe(true);
  expect(result.backendLoaded).toBe(true);
  expect(result.snapshotStatus).toBe('running');
  expect(result.availableExports).toEqual(['function', 'function', 'function', 'function']);
});
