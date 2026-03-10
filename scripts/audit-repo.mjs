#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const errors = [];

function readText(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function walk(dirRel, visit) {
  const dirAbs = path.join(repoRoot, dirRel);
  if (!fs.existsSync(dirAbs)) {
    return;
  }

  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') {
      continue;
    }

    const relPath = path.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      walk(relPath, visit);
    } else {
      visit(relPath.replaceAll('\\', '/'));
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

const rootPackage = JSON.parse(readText('package.json'));
assert(
  typeof rootPackage.packageManager === 'string' && rootPackage.packageManager.startsWith('pnpm@'),
  'package.json must declare pnpm in packageManager'
);
assert(exists('pnpm-workspace.yaml'), 'pnpm-workspace.yaml must exist at the repo root');
assert(exists('pnpm-lock.yaml'), 'pnpm-lock.yaml must exist at the repo root');
assert(exists('rust-toolchain.toml'), 'rust-toolchain.toml must exist at the repo root');
const disallowedLockfiles = [];
walk('.', (relPath) => {
  if (relPath === 'pnpm-lock.yaml') {
    return;
  }
  if (relPath.endsWith('package-lock.json') || relPath.endsWith('pnpm-lock.yaml')) {
    disallowedLockfiles.push(relPath);
  }
});
assert(disallowedLockfiles.length === 0, `remove non-root lockfiles: ${disallowedLockfiles.join(', ')}`);

const eegWebSrc = path.join(repoRoot, 'packages/eeg-web/src');
if (fs.existsSync(eegWebSrc)) {
  const generatedSourceArtifacts = fs
    .readdirSync(eegWebSrc)
    .filter((name) => name.endsWith('.js') || name.endsWith('.d.ts') || name.endsWith('.d.ts.map'))
    .map((name) => `packages/eeg-web/src/${name}`);
  assert(
    generatedSourceArtifacts.length === 0,
    `remove generated artifacts from packages/eeg-web/src: ${generatedSourceArtifacts.join(', ')}`
  );
}

const cargoTomls = ['Cargo.toml'];
walk('crates', (relPath) => {
  if (relPath.endsWith('/Cargo.toml')) {
    cargoTomls.push(relPath);
  }
});

for (const cargoToml of cargoTomls) {
  const manifest = readText(cargoToml);
  assert(/^\s*rust-version\s*=\s*"[^"]+"/m.test(manifest), `${cargoToml} must declare rust-version`);
}

const rootCargo = readText('Cargo.toml');
const workspaceMembersMatch = rootCargo.match(/members\s*=\s*\[(?<body>[\s\S]*?)\]/m);
const workspaceMembers = new Set(
  [...(workspaceMembersMatch?.groups?.body.matchAll(/"([^"]+)"/g) ?? [])].map((match) => match[1])
);

const crateDirs = fs
  .readdirSync(path.join(repoRoot, 'crates'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(repoRoot, 'crates', entry.name, 'Cargo.toml')))
  .map((entry) => `crates/${entry.name}`);

for (const crateDir of crateDirs) {
  assert(workspaceMembers.has(crateDir), `${crateDir} must be listed in workspace members`);
}

for (const member of workspaceMembers) {
  if (member.startsWith('crates/')) {
    assert(exists(path.join(member, 'Cargo.toml')), `workspace member ${member} is missing Cargo.toml`);
  }
}

if (errors.length > 0) {
  console.error('Repository audit failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Repository audit passed.');
