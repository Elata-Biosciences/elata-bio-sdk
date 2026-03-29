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
  'rppg-demo': {
    dir: 'rppg-demo',
    description: 'React + Vite rPPG starter app',
  },
  'eeg-demo': {
    dir: 'eeg-demo',
    description: 'React + Vite EEG starter app with Muse Web Bluetooth support',
  },
};

const starterChoices = [
  {
    name: 'rppg-demo',
    template: 'rppg-demo',
    aliases: ['rppg'],
    headline: 'Camera-based pulse and rPPG starter',
    detail: 'Fastest path to a working browser app. No headset required.',
  },
  {
    name: 'eeg-demo',
    template: 'eeg-demo',
    aliases: ['eeg'],
    headline: 'Browser EEG starter app',
    detail: 'Best for SDK wiring and EEG setup before Bluetooth pairing.',
  },
  {
    name: 'eeg-ble',
    template: 'eeg-demo',
    aliases: ['eeg-web-ble-demo'],
    headline: 'Muse-compatible EEG over Web Bluetooth',
    detail: 'BLE-focused path using the EEG starter scaffold and pairing flow.',
  },
];

const isColorEnabled =
  process.stdin.isTTY && process.stdout.isTTY && !process.env.NO_COLOR;

function ansi(code) {
  return isColorEnabled ? `\u001B[${code}m` : '';
}

const style = {
  reset: ansi('0'),
  bold: ansi('1'),
  dim: ansi('2'),
  cyan: ansi('36'),
  blue: ansi('34'),
  green: ansi('32'),
  yellow: ansi('33'),
};

function paint(text, ...codes) {
  if (!isColorEnabled) {
    return text;
  }
  return `${codes.join('')}${text}${style.reset}`;
}

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

const starterChoiceMap = Object.fromEntries(
  starterChoices.map((choice) => [choice.name, choice]),
);

const templateAliases = Object.fromEntries(
  starterChoices.flatMap((choice) =>
    (choice.aliases ?? []).map((alias) => [alias, choice.name]),
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

function formatChoiceLine(index, choice) {
  return `  ${paint(String(index + 1), style.bold, style.cyan)} ${paint(choice.name, style.bold, style.blue)}`;
}

function formatMetaLine(label, value) {
  return `     ${paint(label, style.dim)} ${value}`;
}

function printTemplates() {
  console.log('Available app starters:\n');
  for (const choice of starterChoices) {
    const aliasSuffix =
      choice.aliases?.length > 0 ? ` (aliases: ${choice.aliases.join(', ')})` : '';
    const templateSuffix =
      choice.template !== choice.name
        ? ` [uses ${choice.template} scaffold]`
        : '';
    console.log(
      `  ${choice.name} - ${choice.headline}${aliasSuffix}${templateSuffix}`,
    );
  }
  console.log('');
}

const legacyTemplateNames = {
  'rppg-web-demo': 'rppg-demo',
  'eeg-web-demo': 'eeg-demo',
  'eeg-web-ble-demo': 'eeg-ble',
};

function normalizeTemplateName(templateName) {
  if (!templateName) {
    return templateName;
  }
  const resolved = legacyTemplateNames[templateName] ?? templateName;
  return templateAliases[resolved] ?? resolved;
}

async function promptForTemplate() {
  console.log(`\n${paint('What would you like to create?', style.bold, style.green)}\n`);
  starterChoices.forEach((choice, index) => {
    console.log(formatChoiceLine(index, choice));
    console.log(`     ${paint(choice.headline, style.bold)}`);
    console.log(`     ${choice.detail}`);
    if (choice.aliases?.length > 0) {
      console.log(formatMetaLine('Aliases:', choice.aliases.join(', ')));
    }
    if (choice.template !== choice.name) {
      console.log(formatMetaLine('Scaffold:', choice.template));
    }
    console.log('');
  });

  const answer = await prompt(
    `${paint('App type', style.bold, style.yellow)} ${paint('[1]:', style.dim)} `,
  );
  if (!answer) {
    return starterChoices[0].name;
  }

  const numericChoice = Number(answer);
  if (Number.isInteger(numericChoice)) {
    const chosen = starterChoices[numericChoice - 1];
    if (chosen) {
      return chosen.name;
    }
  }

  return normalizeTemplateName(answer);
}

function describeSelection(choiceName) {
  const choice = starterChoiceMap[choiceName];
  if (!choice) {
    return choiceName;
  }
  if (choice.template === choice.name) {
    return choice.name;
  }
  return `${choice.name} (${choice.template} scaffold)`;
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
let templateName = normalizeTemplateName(rawTemplateName);
const isInteractive = process.stdin.isTTY && process.stdout.isTTY;

if (!templateSpecified) {
  if (isInteractive) {
    templateName = await promptForTemplate();
  } else {
    templateName = 'rppg-demo';
  }
}
if (templateName === null) {
  console.error('\nCancelled.');
  process.exit(130);
}

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

const starterChoice = starterChoiceMap[templateName];
if (!starterChoice) {
  const invalidTemplateName = rawTemplateName || templateName;
  console.error(`Error: unknown template "${invalidTemplateName}".`);
  printTemplates();
  process.exit(1);
}

const template = templates[starterChoice.template];

const targetDir = resolve(process.cwd(), projectName);
if (existsSync(targetDir)) {
  console.error(`Error: directory "${projectName}" already exists.`);
  process.exit(1);
}

const templateDir = join(__dirname, 'templates', template.dir);
copyDir(templateDir, targetDir, {
  __APP_NAME__: projectName,
  __TEMPLATE_NAME__: starterChoice.name,
  __EEG_WEB_VERSION__: packageVersions.eegWeb,
  __EEG_WEB_BLE_VERSION__: packageVersions.eegWebBle,
  __RPPG_WEB_VERSION__: packageVersions.rppgWeb,
});

console.log(
  `\nCreated ${projectName} using ${describeSelection(starterChoice.name)}!\n`,
);
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
