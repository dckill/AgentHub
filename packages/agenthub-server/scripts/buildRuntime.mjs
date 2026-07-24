import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(serverRoot, 'dist');
const runtimeDirectory = path.join(distRoot, 'runtime');
const buildLockDirectory = path.join(distRoot, '.runtime-build.lock');
const temporaryDirectory = path.join(
  distRoot,
  `.runtime-${process.pid}-${Date.now().toString(36)}`,
);

async function acquireBuildLock() {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      fs.mkdirSync(buildLockDirectory, { mode: 0o700 });
      return () => fs.rmSync(buildLockDirectory, { recursive: true, force: true });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let ageMs;
      try {
        ageMs = Date.now() - fs.statSync(buildLockDirectory).mtimeMs;
      } catch (statError) {
        if (statError?.code === 'ENOENT') continue;
        throw statError;
      }
      if (ageMs > 300_000) {
        fs.rmSync(buildLockDirectory, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for Server runtime build lock: ${buildLockDirectory}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

fs.mkdirSync(distRoot, { recursive: true });
fs.rmSync(temporaryDirectory, { recursive: true, force: true });
const releaseBuildLock = await acquireBuildLock();

try {
  await build({
    entryPoints: {
      main: path.join(serverRoot, 'sources/main.ts'),
      standalone: path.join(serverRoot, 'sources/standalone.ts'),
    },
    outdir: temporaryDirectory,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    external: ['@artsum/agenthub-wire'],
    alias: { '@': path.join(serverRoot, 'sources') },
    banner: {
      js: "import { createRequire as __agenthubCreateRequire } from 'node:module'; const require = __agenthubCreateRequire(import.meta.url);",
    },
    legalComments: 'none',
    logLevel: 'warning',
  });

  for (const entrypoint of ['main.mjs', 'standalone.mjs']) {
    const outputPath = path.join(temporaryDirectory, entrypoint);
    if (!fs.statSync(outputPath).isFile() || fs.statSync(outputPath).size < 1_000) {
      throw new Error(`Server runtime output is missing or unexpectedly small: ${entrypoint}`);
    }
  }

  fs.rmSync(runtimeDirectory, { recursive: true, force: true });
  fs.renameSync(temporaryDirectory, runtimeDirectory);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  releaseBuildLock();
}
