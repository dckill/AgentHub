#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tsx = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cli = join(repoRoot, 'packages', 'agenthub-app', 'sources', 'nativeQa', 'iosNativeQaCli.ts');

if (!existsSync(tsx)) {
    console.error(`tsx binary not found: ${tsx}. Run npx -y pnpm@10.11.0 install first.`);
    process.exit(1);
}

const result = spawnSync(process.execPath, [tsx, cli, ...process.argv.slice(2)], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
});

process.exit(result.status ?? 1);
