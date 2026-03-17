#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

const templates = {
  'rppg-web-demo': {
    dir: 'rppg-web-demo',
    description: 'React + Vite rPPG heart-rate demo',
  },
  'eeg-web-demo': {
    dir: 'eeg-web-demo',
    description: 'React + Vite EEG WASM demo',
  },
  'eeg-web-ble-demo': {
    dir: 'eeg-web-ble-demo',
    description: 'React + Vite Muse Web Bluetooth demo',
  },
};

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    }),
  );
}

function printTemplates() {
  console.log('Available templates:\n');
  for (const [name, info] of Object.entries(templates)) {
    console.log(`  ${name} - ${info.description}`);
  }
  console.log('');
}

function copyDir(src, dest, transforms) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
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

function parseArgs(argv) {
  const args = [...argv];
  let projectName = '';
  let templateName = 'rppg-web-demo';
  let listTemplates = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) continue;

    if (arg === '--template') {
      templateName = args.shift() ?? '';
      continue;
    }

    if (arg.startsWith('--template=')) {
      templateName = arg.slice('--template='.length);
      continue;
    }

    if (arg === '--list-templates') {
      listTemplates = true;
      continue;
    }

    if (!projectName) {
      projectName = arg;
      continue;
    }
  }

  return { projectName, templateName, listTemplates };
}

const { projectName: rawProjectName, templateName, listTemplates } = parseArgs(
  process.argv.slice(2),
);

if (listTemplates) {
  printTemplates();
  process.exit(0);
}

let projectName = rawProjectName;
if (!projectName) {
  projectName = await prompt('Project name: ');
}
if (!projectName) {
  console.error('Error: project name is required.');
  process.exit(1);
}

const template = templates[templateName];
if (!template) {
  console.error(`Error: unknown template "${templateName}".`);
  printTemplates();
  process.exit(1);
}

const targetDir = join(process.cwd(), projectName);
if (existsSync(targetDir)) {
  console.error(`Error: directory "${projectName}" already exists.`);
  process.exit(1);
}

const templateDir = join(__dirname, 'templates', template.dir);
copyDir(templateDir, targetDir, {
  __APP_NAME__: projectName,
  __TEMPLATE_NAME__: templateName,
});

console.log(`\nCreated ${projectName} using ${templateName}!\n`);
console.log('Next steps:\n');
console.log(`  cd ${projectName}`);
console.log('  npm install');
console.log('  npm run dev\n');
