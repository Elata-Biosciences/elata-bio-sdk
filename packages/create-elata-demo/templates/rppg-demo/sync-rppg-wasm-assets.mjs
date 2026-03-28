#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const appRoot = process.cwd();
  const srcDir = path.join(
    appRoot,
    "node_modules",
    "@elata-biosciences",
    "rppg-web",
    "pkg",
  );
  const destDir = path.join(appRoot, "public", "pkg");

  await fs.mkdir(destDir, { recursive: true });

  const candidates = [
    { from: "rppg_wasm.js", to: "rppg_wasm.js" },
    { from: "rppg_wasm_bg.wasm", to: "rppg_wasm_bg.wasm" },
    // Legacy fallback paths some apps use
    { from: "eeg_wasm.js", to: "eeg_wasm.js" },
    { from: "eeg_wasm_bg.wasm", to: "eeg_wasm_bg.wasm" },
  ];

  let copied = 0;
  for (const file of candidates) {
    const fromPath = path.join(srcDir, file.from);
    if (!(await exists(fromPath))) continue;
    const toPath = path.join(destDir, file.to);
    await fs.copyFile(fromPath, toPath);
    copied += 1;
    console.log(`[rppg-demo] Copied ${file.from} -> public/pkg/${file.to}`);
  }

  if (copied === 0) {
    throw new Error(
      `[rppg-demo] No packaged rPPG WASM assets found under ${srcDir}. ` +
        `Make sure @elata-biosciences/rppg-web is installed and run the demo install again.`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

