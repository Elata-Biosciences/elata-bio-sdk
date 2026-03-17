#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

function copyDir(src, dest, transforms) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    // _gitignore → .gitignore (npm strips dotfiles from published packages)
    const destName = entry === '_gitignore' ? '.gitignore' : entry;
    const destPath = join(dest, destName);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, transforms);
    } else {
      let content = readFileSync(srcPath, 'utf8');
      for (const [pattern, replacement] of Object.entries(transforms)) {
        content = content.replaceAll(pattern, replacement);
      }
      writeFileSync(destPath, content, 'utf8');
    }
  }
}

let projectName = process.argv[2];
if (!projectName) {
  projectName = await prompt('Project name: ');
}
if (!projectName) {
  console.error('Error: project name is required.');
  process.exit(1);
}

const targetDir = join(process.cwd(), projectName);
if (existsSync(targetDir)) {
  console.error(`Error: directory "${projectName}" already exists.`);
  process.exit(1);
}

const templateDir = join(__dirname, 'template');
copyDir(templateDir, targetDir, { __APP_NAME__: projectName });

console.log(`\nCreated ${projectName}!\n`);
console.log('Next steps:\n');
console.log(`  cd ${projectName}`);
console.log('  npm install');
console.log('  npm run dev\n');
console.log('Open http://localhost:5173 — point your camera at your face to measure heart rate.\n');
