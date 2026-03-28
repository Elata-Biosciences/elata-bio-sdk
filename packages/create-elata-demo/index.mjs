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
    aliases: ['rppg'],
  },
  'eeg-web-demo': {
    dir: 'eeg-web-demo',
    description: 'React + Vite EEG WASM demo',
    aliases: ['eeg'],
  },
  'eeg-web-ble-demo': {
    dir: 'eeg-web-ble-demo',
    description: 'React + Vite Muse Web Bluetooth demo',
    aliases: ['eeg-ble'],
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

const templateAliases = Object.fromEntries(
  Object.entries(templates).flatMap(([name, info]) =>
    (info.aliases ?? []).map((alias) => [alias, name]),
  ),
);

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      rl.close();
      resolve(value);
    };

    rl.on('SIGINT', () => finish(null));
    rl.on('close', () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    });

    rl.question(question, (ans) => finish(ans.trim()));
  });
}

function printTemplates() {
  console.log('Available templates:\n');
  for (const [name, info] of Object.entries(templates)) {
    const aliasSuffix =
      info.aliases?.length > 0 ? ` (aliases: ${info.aliases.join(', ')})` : '';
    console.log(`  ${name} - ${info.description}${aliasSuffix}`);
  }
  console.log('');
}

function normalizeTemplateName(templateName) {
  if (!templateName) {
    return templateName;
  }
  return templateAliases[templateName] ?? templateName;
}

async function promptForTemplate() {
  const entries = Object.entries(templates);

  console.log('Choose a template:\n');
  entries.forEach(([name, info], index) => {
    const aliasSuffix =
      info.aliases?.length > 0 ? ` (aliases: ${info.aliases.join(', ')})` : '';
    console.log(`  ${index + 1}. ${name} - ${info.description}${aliasSuffix}`);
  });
  console.log('');

  const answer = await prompt('Template [1]: ');
  if (!answer) {
    return entries[0][0];
  }

  const numericChoice = Number(answer);
  if (Number.isInteger(numericChoice)) {
    const chosen = entries[numericChoice - 1];
    if (chosen) {
      return chosen[0];
    }
  }

  return normalizeTemplateName(answer);
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
  let templateName = '';
  let listTemplates = false;
  let templateSpecified = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg) continue;

    if (arg === '--template') {
      templateName = args.shift() ?? '';
      templateSpecified = true;
      continue;
    }

    if (arg.startsWith('--template=')) {
      templateName = arg.slice('--template='.length);
      templateSpecified = true;
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

  return { projectName, templateName, listTemplates, templateSpecified };
}

const {
  projectName: rawProjectName,
  templateName: rawTemplateName,
  listTemplates,
  templateSpecified,
} = parseArgs(process.argv.slice(2));

if (listTemplates) {
  printTemplates();
  process.exit(0);
}

let projectName = rawProjectName;
if (!projectName) {
  projectName = await prompt('Project name: ');
}
if (projectName === null) {
  console.error('\nCancelled.');
  process.exit(130);
}
if (!projectName) {
  console.error('Error: project name is required.');
  process.exit(1);
}

let templateName = normalizeTemplateName(rawTemplateName);
if (!templateSpecified) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    templateName = await promptForTemplate();
  } else {
    templateName = 'rppg-web-demo';
  }
}
if (templateName === null) {
  console.error('\nCancelled.');
  process.exit(130);
}

const template = templates[templateName];
if (!template) {
  const invalidTemplateName = rawTemplateName || templateName;
  console.error(`Error: unknown template "${invalidTemplateName}".`);
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
