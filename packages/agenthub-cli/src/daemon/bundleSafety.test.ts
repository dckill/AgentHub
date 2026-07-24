import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  restoreBundleBackup,
  validateBundleCandidate,
  writeBundleBackup,
} from './bundleSafety';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('daemon bundle safety', () => {
  it('accepts a syntactically valid candidate only after a version smoke succeeds', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agenthub-bundle-safety-'));
    temporaryDirectories.push(directory);
    const candidate = join(directory, 'index.mjs');
    await writeFile(candidate, 'process.exit(0);\n');

    await expect(validateBundleCandidate(candidate)).resolves.toMatchObject({ ok: true });
  });

  it('rejects a corrupt candidate without executing it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agenthub-bundle-safety-'));
    temporaryDirectories.push(directory);
    const candidate = join(directory, 'index.mjs');
    await writeFile(candidate, 'export = ;\n');

    await expect(validateBundleCandidate(candidate)).resolves.toMatchObject({ ok: false });
  });

  it('rejects a symlink candidate instead of executing a file outside the bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agenthub-bundle-safety-'));
    temporaryDirectories.push(directory);
    const target = join(directory, 'outside.mjs');
    const candidate = join(directory, 'index.mjs');
    await writeFile(target, 'process.exit(0);\n');
    await symlink(target, candidate);

    await expect(validateBundleCandidate(candidate)).resolves.toMatchObject({ ok: false });
  });

  it('writes and restores a previous bundle through an atomic replacement', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agenthub-bundle-safety-'));
    temporaryDirectories.push(directory);
    const target = join(directory, 'index.mjs');
    const backup = join(directory, 'index.previous.mjs');
    await writeFile(target, 'new bundle');
    await writeBundleBackup(target, backup);
    await writeFile(target, 'corrupt bundle');

    await restoreBundleBackup(backup, target);

    await expect(readFile(target, 'utf8')).resolves.toBe('new bundle');
  });

  it('restores every chunk when the bundle is represented by a directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agenthub-bundle-safety-'));
    temporaryDirectories.push(directory);
    const bundle = join(directory, 'dist');
    const backup = join(directory, 'dist.previous');
    await mkdir(bundle, { recursive: true });
    await writeFile(join(bundle, 'index.mjs'), "import './chunk.mjs';\n");
    await writeFile(join(bundle, 'chunk.mjs'), 'export const marker = "old";\n');
    await writeBundleBackup(bundle, backup);
    await writeFile(join(bundle, 'chunk.mjs'), 'export = ;\n');
    await rm(join(bundle, 'index.mjs'));

    await restoreBundleBackup(backup, bundle);

    await expect(readFile(join(bundle, 'index.mjs'), 'utf8')).resolves.toContain('chunk.mjs');
    await expect(readFile(join(bundle, 'chunk.mjs'), 'utf8')).resolves.toContain('marker = "old"');
  });
});
