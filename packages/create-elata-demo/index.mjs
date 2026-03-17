#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageMetadata = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8'),
);

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

function readVersion(relativePath, fallbackVersion, packageName) {
  const candidate = join(__dirname, relativePath);
  if (existsSync(candidate)) {
    return JSON.parse(readFileSync(candidate, 'utf8')).version;
  }
  if (fallbackVersion) {
    return fallbackVersion;
  }
  throw new Error(`Missing packaged SDK version metadata for ${packageName}.`);
}

const packageVersions = {
  eegWeb: readVersion(
    '../eeg-web/package.json',
    packageMetadata.elataSdkVersions?.eegWeb,
    '@elata-biosciences/eeg-web',
  ),
  eegWebBle: readVersion(
    '../eeg-web-ble/package.json',
    packageMetadata.elataSdkVersions?.eegWebBle,
    '@elata-biosciences/eeg-web-ble',
  ),
  rppgWeb: readVersion(
    '../rppg-web/package.json',
    packageMetadata.elataSdkVersions?.rppgWeb,
    '@elata-biosciences/rppg-web',
  ),
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

function findParentPnpmWorkspace(startDir) {
  let currentDir = resolve(startDir);

  while (true) {
    const workspaceFile = join(currentDir, 'pnpm-workspace.yaml');
    if (existsSync(workspaceFile)) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
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

const targetDir = resolve(process.cwd(), projectName);
if (existsSync(targetDir)) {
  console.error(`Error: directory "${projectName}" already exists.`);
  process.exit(1);
}

const templateDir = join(__dirname, 'templates', template.dir);
copyDir(templateDir, targetDir, {
  __APP_NAME__: projectName,
  __TEMPLATE_NAME__: templateName,
  __EEG_WEB_VERSION__: packageVersions.eegWeb,
  __EEG_WEB_BLE_VERSION__: packageVersions.eegWebBle,
  __RPPG_WEB_VERSION__: packageVersions.rppgWeb,
});

console.log(`\nCreated ${projectName} using ${templateName}!\n`);
console.log('Next steps:\n');
console.log(`  cd ${projectName}`);
console.log('  npm install');
console.log('  npm run dev\n');

const parentWorkspaceDir = findParentPnpmWorkspace(dirname(targetDir));
if (parentWorkspaceDir) {
  console.log('Note: this app was created inside an existing pnpm workspace.\n');
  console.log(
    'If the new app is not added to that workspace, use one of these install flows:\n',
  );
  console.log(`  pnpm --dir ${projectName} --ignore-workspace install`);
  console.log(`  pnpm --dir ${projectName} --ignore-workspace run dev`);
  console.log('  # or');
  console.log(`  cd ${projectName} && npm install && npm run dev\n`);
}
