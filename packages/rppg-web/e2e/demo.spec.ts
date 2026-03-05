import { test, expect } from '@playwright/test';
import { spawn, execFileSync, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function startServer(): ChildProcess {
  const cmd = 'npx';
  const args = ['http-server', 'demo', '-p', '8080', '--silent'];
  const proc = spawn(cmd, args, { stdio: 'inherit', shell: true });
  return proc;
}

test.beforeAll(async () => {
  const root = path.join(__dirname, '..', '..', '..');
  execFileSync(
    'npm',
    ['--prefix', 'packages/rppg-web', 'run', 'build:demo'],
    { stdio: 'inherit', cwd: root, shell: true }
  );
});

let server: ChildProcess | null = null;

test.beforeEach(async () => {
  server = startServer();
  // allow server to start
  await new Promise((r) => setTimeout(r, 800));
});

test.afterEach(async () => {
  if (server) {
    server.kill();
    server = null;
  }
});

test('demo loads and exposes wasm backend when package exists', async ({ page }) => {
  await page.goto('http://localhost:8080/e2e.html');

  // wait for the demo to set the global
  await page.waitForFunction(() => (window as any).__rppg_demo !== undefined, null, { timeout: 10000 });
  const backendAvailable = await page.evaluate(() => (window as any).__rppg_demo.backendAvailable);
  expect(backendAvailable).toBe(true);
});
