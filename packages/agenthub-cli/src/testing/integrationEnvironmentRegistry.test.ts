import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupRegisteredIntegrationEnvironments,
  readRegisteredIntegrationEnvironments,
  registerIntegrationEnvironment,
} from './integrationEnvironmentRegistry';

const temporaryDirectories: string[] = [];

function createManifestPath() {
  const directory = mkdtempSync(join(tmpdir(), 'agenthub-integration-registry-test-'));
  temporaryDirectories.push(directory);
  return join(directory, 'environments.jsonl');
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('integration environment parent-owned cleanup registry', () => {
  it('records validated environment names in a private manifest and reads them once', () => {
    const manifestPath = createManifestPath();

    registerIntegrationEnvironment(manifestPath, 'cool-star');
    registerIntegrationEnvironment(manifestPath, 'warm-forest');
    registerIntegrationEnvironment(manifestPath, 'cool-star');

    expect(statSync(manifestPath).mode & 0o777).toBe(0o600);
    expect(readRegisteredIntegrationEnvironments(manifestPath)).toEqual(['cool-star', 'warm-forest']);
    expect(readFileSync(manifestPath, 'utf8')).not.toContain('token');
  });

  it('rejects unsafe names before writing the manifest', () => {
    const manifestPath = createManifestPath();
    expect(() => registerIntegrationEnvironment(manifestPath, '../production')).toThrow('Invalid integration environment name');
    expect(readRegisteredIntegrationEnvironments(manifestPath)).toEqual([]);
  });

  it('attempts every registered cleanup, removes the manifest, and reports aggregate failure', async () => {
    const manifestPath = createManifestPath();
    registerIntegrationEnvironment(manifestPath, 'cool-star');
    registerIntegrationEnvironment(manifestPath, 'warm-forest');
    const cleanup = vi.fn(async (name: string) => {
      if (name === 'cool-star') throw new Error('first cleanup failed');
    });

    await expect(cleanupRegisteredIntegrationEnvironments(manifestPath, cleanup)).rejects.toThrow(
      'Failed to clean 1 integration environment',
    );
    expect(cleanup.mock.calls.map(([name]) => name)).toEqual(['cool-star', 'warm-forest']);
    expect(readRegisteredIntegrationEnvironments(manifestPath)).toEqual([]);
  });

  it('cleans valid entries before reporting a truncated manifest tail', async () => {
    const manifestPath = createManifestPath();
    registerIntegrationEnvironment(manifestPath, 'cool-star');
    appendFileSync(manifestPath, '{"name":', 'utf8');
    const cleanup = vi.fn(async () => undefined);

    await expect(cleanupRegisteredIntegrationEnvironments(manifestPath, cleanup)).rejects.toThrow(
      'Failed to process 1 integration environment cleanup manifest entry',
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledWith('cool-star');
    expect(readRegisteredIntegrationEnvironments(manifestPath)).toEqual([]);
  });
});
