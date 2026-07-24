import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiClient } from '@/api/api';
import { encodeBase64 } from '@/api/encryption';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { configuration } from '@/configuration';
import { readCredentials, readSettings } from '@/persistence';
import {
  createLifecycleFixtureChildScript,
  createLifecycleFixtureMetadata,
  publicLifecycleFixtureReport,
  type LifecycleFixtureMode,
} from './lifecycleWebFixture';

async function main() {
  const credentials = await readCredentials();
  const settings = await readSettings();
  if (!credentials) throw new Error('Authenticated CLI credentials are required');
  if (!settings.machineId) throw new Error('A registered machineId is required');

  const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
  const mode = (modeArgument?.slice('--mode='.length) || 'stubborn') as LifecycleFixtureMode;
  if (mode !== 'cooperative' && mode !== 'stubborn') {
    throw new Error(`Unsupported lifecycle fixture mode: ${mode}`);
  }
  const cwd = process.argv.slice(2).find((argument) => !argument.startsWith('--mode=')) || process.cwd();
  const child = spawn(process.execPath, [
    '-e',
    createLifecycleFixtureChildScript(mode),
  ], { cwd, stdio: ['ignore', 'pipe', 'inherit'] });
  if (!child.pid) throw new Error('Failed to spawn stubborn lifecycle child');

  const stopChild = () => {
    if (!child.killed) child.kill('SIGKILL');
  };
  process.once('SIGINT', stopChild);
  process.once('SIGTERM', stopChild);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Lifecycle child did not become ready')), 5_000);
      child.stdout?.on('data', (chunk) => {
        if (!String(chunk).includes('ready')) return;
        clearTimeout(timeout);
        resolve();
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    const metadata = createLifecycleFixtureMetadata({
      cwd,
      homeDir: configuration.agentHubHomeDir,
      machineId: settings.machineId,
      hostPid: child.pid,
      host: hostname(),
    });
    metadata.name = mode === 'cooperative'
      ? 'Lifecycle cooperative exit fixture'
      : 'Lifecycle timeout fixture';
    metadata.agentHubLibDir = join(configuration.agentHubHomeDir, 'lib');
    metadata.agentHubToolsDir = join(configuration.agentHubHomeDir, 'tools');

    const api = await ApiClient.create(credentials);
    const session = await api.getOrCreateSession({
      tag: `lifecycle-web-${randomUUID()}`,
      metadata,
      state: null,
    });
    if (!session) throw new Error('Failed to create the encrypted lifecycle session');

    const registration = await notifyDaemonSessionStarted(session.id, metadata, {
      encryptionKey: encodeBase64(session.encryptionKey),
      encryptionVariant: session.encryptionVariant,
      seq: session.seq,
      metadataVersion: session.metadataVersion,
      agentStateVersion: session.agentStateVersion,
    });
    if (registration?.error) throw new Error(registration.error);

    const report = publicLifecycleFixtureReport({
      sessionId: session.id,
      machineId: settings.machineId,
      childPid: child.pid,
      token: credentials.token,
      encryptionKey: encodeBase64(session.encryptionKey),
    });
    process.stdout.write(`[LIFECYCLE_WEB_FIXTURE_READY] ${JSON.stringify(report)}\n`);
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    process.stdout.write(`[LIFECYCLE_WEB_FIXTURE_CHILD_EXITED] ${JSON.stringify(report)}\n`);
  } finally {
    stopChild();
    process.off('SIGINT', stopChild);
    process.off('SIGTERM', stopChild);
  }
}

void main().catch((error) => {
  process.stderr.write(`[LIFECYCLE_WEB_FIXTURE_ERROR] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
