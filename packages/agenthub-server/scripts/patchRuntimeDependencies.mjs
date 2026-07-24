import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(serverRoot, '../..');
const runtimeImporterRoot = path.join(repositoryRoot, 'packages/agenthub-server-runtime');
const requireFromRuntime = createRequire(path.join(runtimeImporterRoot, 'package.json'));
const adapterEntry = requireFromRuntime.resolve('pglite-prisma-adapter');
let adapterRoot = path.dirname(adapterEntry);
while (adapterRoot !== path.dirname(adapterRoot)
  && !fs.existsSync(path.join(adapterRoot, 'package.json'))) {
  adapterRoot = path.dirname(adapterRoot);
}
if (!fs.existsSync(path.join(adapterRoot, 'package.json'))) {
  throw new Error('Unable to locate pglite-prisma-adapter package root');
}
const patchScript = path.join(repositoryRoot, 'patches/fix-pglite-prisma-bytes.cjs');
const result = spawnSync(process.execPath, [patchScript], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    AGENTHUB_PGLITE_PRISMA_PACKAGE_ROOT: adapterRoot,
  },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.status !== 0) {
  throw new Error(`Runtime dependency patch failed: ${result.stderr || result.stdout}`);
}
process.stdout.write(result.stdout);
