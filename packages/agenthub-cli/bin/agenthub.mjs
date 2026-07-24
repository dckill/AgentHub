#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const require = createRequire(import.meta.url);
const { unpackTools } = require('../scripts/unpack-tools.cjs');

try {
  await unpackTools({ silent: true });
} catch (error) {
  console.error(`AgentHub could not prepare its bundled tools: ${error.message}`);
  process.exit(1);
}

const hasNoWarnings = process.execArgv.includes('--no-warnings');
const hasNoDeprecation = process.execArgv.includes('--no-deprecation');

if (!hasNoWarnings || !hasNoDeprecation) {
  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const entrypoint = join(projectRoot, 'dist', 'index.mjs');

  try {
    execFileSync(process.execPath, [
      '--no-warnings',
      '--no-deprecation',
      entrypoint,
      ...process.argv.slice(2),
    ], {
      stdio: 'inherit',
      env: process.env,
    });
  } catch (error) {
    process.exit(error.status || 1);
  }
} else {
  import('../dist/index.mjs');
}
