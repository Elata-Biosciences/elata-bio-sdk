#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  renameSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const tempRoot = mkdtempSync(path.join(tmpdir(), "elata-consumer-smoke-"));
const tarballDir = path.join(tempRoot, "tarballs");

mkdirSync(tarballDir, { recursive: true });

function run(cmd, args, cwd, opts = {}) {
  const full = `${cmd} ${args.join(" ")}`;
  console.log(`[smoke-consumers] ${full}`);
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: opts.capture ? "pipe" : "inherit",
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    const details = opts.capture
      ? `\n${res.stdout ?? ""}\n${res.stderr ?? ""}`
      : "";
    throw new Error(`Command failed (${res.status}): ${full}${details}`);
  }
  return res.stdout ?? "";
}

function packPackage(relativeDir) {
  const pkgDir = path.join(repoRoot, relativeDir);
  const output = run("pnpm", ["pack"], pkgDir, { capture: true });
  const match = output.match(/([^\s]+\.tgz)/g);
  if (!match || match.length === 0) {
    throw new Error(`Could not find tarball name in pnpm pack output for ${relativeDir}`);
  }
  const filename = match.at(-1);
  const src = path.join(pkgDir, filename);
  const dest = path.join(tarballDir, filename);
  if (!existsSync(src)) {
    throw new Error(`Expected tarball not found: ${src}`);
  }
  renameSync(src, dest);
  return dest;
}

function createBaseApp(appDir, extraDeps, appCode) {
  mkdirSync(path.join(appDir, "src"), { recursive: true });
  writeFileSync(
    path.join(appDir, "package.json"),
    `${JSON.stringify(
      {
        name: path.basename(appDir),
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -b && vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1",
          ...extraDeps,
        },
        devDependencies: {
          "@types/react": "^18.3.12",
          "@types/react-dom": "^18.3.1",
          "@vitejs/plugin-react": "^4.3.4",
          typescript: "^5.6.2",
          vite: "^6.0.5",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(appDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          allowJs: false,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          module: "ESNext",
          moduleResolution: "Node",
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx",
        },
        include: ["src"],
        references: [],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(appDir, "vite.config.ts"),
    "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n",
  );
  writeFileSync(
    path.join(appDir, "index.html"),
    "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>consumer-smoke</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>\n",
  );
  writeFileSync(
    path.join(appDir, "src", "main.tsx"),
    "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n",
  );
  writeFileSync(path.join(appDir, "src", "App.tsx"), appCode);
}

function rewriteDependencies(appDir, replacements) {
  const pkgPath = path.join(appDir, "package.json");
  const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"));
  for (const [name, version] of Object.entries(replacements)) {
    if (pkgJson.dependencies?.[name]) {
      pkgJson.dependencies[name] = version;
    }
    if (pkgJson.devDependencies?.[name]) {
      pkgJson.devDependencies[name] = version;
    }
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
}

const tarballs = {};

try {
  tarballs.createElataDemo = packPackage("packages/create-elata-demo");
  tarballs.eegWeb = packPackage("packages/eeg-web");
  tarballs.eegWebBle = packPackage("packages/eeg-web-ble");
  tarballs.rppgWeb = packPackage("packages/rppg-web");

  const scaffoldRoot = path.join(tempRoot, "scaffolded");
  mkdirSync(scaffoldRoot, { recursive: true });
  run(
    "pnpm",
    [
      "dlx",
      tarballs.createElataDemo,
      "consumer-create-elata-demo",
      "--template",
      "rppg-web-demo",
    ],
    scaffoldRoot,
  );

  const scaffoldedApp = path.join(scaffoldRoot, "consumer-create-elata-demo");
  rewriteDependencies(scaffoldedApp, {
    "@elata-biosciences/rppg-web": tarballs.rppgWeb,
  });
  run("pnpm", ["install"], scaffoldedApp);
  run("pnpm", ["run", "build"], scaffoldedApp);

  const eegApp = path.join(tempRoot, "consumer-eeg-web");
  createBaseApp(
    eegApp,
    {
      "@elata-biosciences/eeg-web": tarballs.eegWeb,
    },
    "import { band_powers } from '@elata-biosciences/eeg-web';\n\nexport default function App() {\n  const values = new Float32Array([0, 1, 0, -1]);\n  const result = band_powers(values, 256);\n  return <main>Alpha {result.alpha.toFixed(2)}</main>;\n}\n",
  );

  const bleApp = path.join(tempRoot, "consumer-eeg-web-ble");
  createBaseApp(
    bleApp,
    {
      "@elata-biosciences/eeg-web": tarballs.eegWeb,
      "@elata-biosciences/eeg-web-ble": tarballs.eegWebBle,
    },
    "import { BleTransport } from '@elata-biosciences/eeg-web-ble';\n\nconst transport = new BleTransport();\n\nexport default function App() {\n  return <main>BLE transport {typeof transport.connect}</main>;\n}\n",
  );

  const rppgApp = path.join(tempRoot, "consumer-rppg-web");
  createBaseApp(
    rppgApp,
    {
      "@elata-biosciences/rppg-web": tarballs.rppgWeb,
    },
    "import { RppgProcessor } from '@elata-biosciences/rppg-web';\n\nconst backend = {\n  newPipeline: () => ({\n    push_sample() {},\n    get_metrics() {\n      return { bpm: null, confidence: 0, signal_quality: 0 };\n    },\n  }),\n};\n\nexport default function App() {\n  const processor = new RppgProcessor(backend, 30, 5);\n  const metrics = processor.getMetrics();\n  return <main>rPPG confidence {metrics.confidence.toFixed(2)}</main>;\n}\n",
  );

  for (const appDir of [eegApp, bleApp, rppgApp]) {
    run("pnpm", ["install"], appDir);
    run("pnpm", ["run", "build"], appDir);
  }

  console.log(`[smoke-consumers] OK: smoke-tested apps in ${tempRoot}`);
} catch (error) {
  console.error(
    `[smoke-consumers] ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error(`[smoke-consumers] Preserving temp directory for inspection: ${tempRoot}`);
  process.exitCode = 1;
} finally {
  if (!process.exitCode) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
