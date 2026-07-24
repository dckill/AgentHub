import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { ApiClient } from './api';
import { decodeBase64, decrypt } from './encryption';
import { readCredentials } from '@/persistence';
import { configuration } from '@/configuration';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { TerminalOutboxJournal } from './terminalOutboxJournal';
const temporaryChildren: ChildProcess[] = [];

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 10_000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

function waitForOutput(child: ChildProcess, marker: string, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Child did not emit ${marker}`)), timeoutMs);
    let output = '';
    const onData = (chunk: Buffer) => {
      output += String(chunk);
      if (!output.includes(marker)) return;
      clearTimeout(timeout);
      child.stdout?.off('data', onData);
      resolve(output);
    };
    child.stdout?.on('data', onData);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForExit(child: ChildProcess): Promise<{ signal: NodeJS.Signals | null; code: number | null }> {
  return new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', reject);
  });
}

function buildJournalChildScript(mode: 'crash' | 'crash-after-post' | 'replay', sessionModulePath: string, journalModulePath: string): string {
  const sessionEnd = mode === 'crash' ? [
    `client.sendSessionEvent({ type: 'message', message: 'cross-process journal replay' });`,
    `client.sendSessionDeath();`,
    `process.stdout.write('ready\\n');`,
    `setInterval(() => {}, 1000);`,
  ] : mode === 'crash-after-post' ? [
    `const { TerminalOutboxJournal } = await import(${JSON.stringify(journalModulePath)});`,
    `const originalAcknowledge = TerminalOutboxJournal.prototype.acknowledge;`,
    `TerminalOutboxJournal.prototype.acknowledge = function (localIds) {`,
    `  process.stdout.write('post-ack\\n');`,
    `  process.kill(process.pid, 'SIGKILL');`,
    `  return originalAcknowledge.call(this, localIds);`,
    `};`,
    `client.sendSessionEvent({ type: 'message', message: 'post-success crash replay' });`,
    `setInterval(() => {}, 1000);`,
  ] : [
    `await client.flush();`,
    `await new Promise((resolve) => setTimeout(resolve, 1500));`,
    `await client.close();`,
    `const journalPath = join(process.env.AGENTHUB_HOME_DIR, 'terminal-outbox', encodeURIComponent(session.id) + '.json');`,
    `const journalState = JSON.parse(readFileSync(journalPath, 'utf8'));`,
    `process.stdout.write('replayed:' + journalState.messages.length + ':' + Boolean(journalState.sessionEnd) + '\\n');`,
  ];

  return [
    `import { ApiSessionClient } from ${JSON.stringify(sessionModulePath)};`,
    `import { readFileSync } from 'node:fs';`,
    `import { join } from 'node:path';`,
    `const raw = JSON.parse(process.env.AGENTHUB_JOURNAL_SESSION);`,
    `const session = { ...raw, encryptionKey: new Uint8Array(raw.encryptionKey) };`,
    `const client = new ApiSessionClient(process.env.AGENTHUB_JOURNAL_TOKEN, session);`,
    ...sessionEnd,
  ].join('\n');
}

function spawnJournalChild(mode: 'crash' | 'crash-after-post' | 'replay', session: unknown, token: string, serverUrl: string): ChildProcess {
  const modulePath = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'apiSession.ts')).href;
  const journalModulePath = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'terminalOutboxJournal.ts')).href;
  const child = spawn(process.execPath, [
    '--import', 'tsx/esm',
    '--input-type=module',
    '-e', buildJournalChildScript(mode, modulePath, journalModulePath),
  ], {
    cwd: join(dirname(fileURLToPath(import.meta.url)), '../..'),
    env: {
      ...process.env,
      AGENTHUB_SERVER_URL: serverUrl,
      AGENTHUB_JOURNAL_SESSION: JSON.stringify(session),
      AGENTHUB_JOURNAL_TOKEN: token,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  temporaryChildren.push(child);
  return child;
}

afterEach(() => {
  for (const child of temporaryChildren.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
});

describe('TerminalOutboxJournal authenticated cross-process recovery', () => {
  it('replays an encrypted message and session-end marker after a crashed process and reconnect', { timeout: 60_000 }, async () => {
    const credentials = await readCredentials();
    if (!credentials) throw new Error('Authenticated integration credentials are unavailable');

    const { state, metadata } = createSessionMetadata({
      flavor: 'codex',
      machineId: 'journal-cross-process-machine',
      startedBy: 'terminal',
    });
    const api = await ApiClient.create(credentials);
    const session = await api.getOrCreateSession({
      tag: `journal-cross-process-${Date.now()}`,
      metadata,
      state,
    });
    if (!session) throw new Error('Authenticated integration session creation returned null');

    const sessionPayload = {
      ...session,
      encryptionKey: Array.from(session.encryptionKey),
    };
    const journalPath = join(
      configuration.agentHubHomeDir,
      'terminal-outbox',
      `${encodeURIComponent(session.id)}.json`,
    );
    const journal = new TerminalOutboxJournal(journalPath);
    const crashed = spawnJournalChild('crash', sessionPayload, credentials.token, 'http://127.0.0.1:9');
    await waitForOutput(crashed, 'ready');
    await waitFor(async () => journal.load().length === 1 && journal.pendingSessionEnd() !== null, 5_000, 50);
    const crashExit = waitForExit(crashed);
    crashed.kill('SIGKILL');
    await expect(crashExit).resolves.toMatchObject({ signal: 'SIGKILL' });

    expect(journal.load()).toHaveLength(1);
    expect(journal.pendingSessionEnd()?.sessionId).toBe(session.id);

    const replay = spawnJournalChild('replay', sessionPayload, credentials.token, configuration.serverUrl);
    await waitForOutput(replay, 'replayed', 15_000);
    await waitForExit(replay);
    await waitFor(async () => {
      const recoveredJournal = new TerminalOutboxJournal(journalPath);
      return recoveredJournal.load().length === 0 && recoveredJournal.pendingSessionEnd() === null;
    }, 10_000, 100);

    const messagesResponse = await fetch(`${configuration.serverUrl}/v3/sessions/${encodeURIComponent(session.id)}/messages?after_seq=0&limit=100`, {
      headers: { Authorization: `Bearer ${credentials.token}` },
    });
    expect(messagesResponse.ok).toBe(true);
    const messagesPayload = await messagesResponse.json() as { messages: Array<{ content?: { t?: string; c?: string } }> };
    const replayed = messagesPayload.messages
      .map((message) => message.content?.t === 'encrypted' && message.content.c
        ? decrypt(session.encryptionKey, session.encryptionVariant, decodeBase64(message.content.c))
        : null)
      .find((content: any) => content?.content?.data?.message === 'cross-process journal replay');
    expect(replayed).toBeTruthy();

    const sessionResponse = await fetch(`${configuration.serverUrl}/v1/sessions/${encodeURIComponent(session.id)}`, {
      headers: { Authorization: `Bearer ${credentials.token}` },
    });
    expect(sessionResponse.ok).toBe(true);
    const sessionPayloadAfterReplay = await sessionResponse.json() as { session: { active: boolean; thinking: boolean } };
    expect(sessionPayloadAfterReplay.session.active).toBe(false);
    expect(sessionPayloadAfterReplay.session.thinking).toBe(false);
    expect(existsSync(journalPath)).toBe(true);
  });

  it('replays idempotently when the process dies after POST success but before journal acknowledgement', { timeout: 60_000 }, async () => {
    const credentials = await readCredentials();
    if (!credentials) throw new Error('Authenticated integration credentials are unavailable');

    const { state, metadata } = createSessionMetadata({
      flavor: 'codex',
      machineId: 'journal-post-success-crash-machine',
      startedBy: 'terminal',
    });
    const api = await ApiClient.create(credentials);
    const session = await api.getOrCreateSession({
      tag: `journal-post-success-crash-${Date.now()}`,
      metadata,
      state,
    });
    if (!session) throw new Error('Authenticated integration session creation returned null');

    const sessionPayload = {
      ...session,
      encryptionKey: Array.from(session.encryptionKey),
    };
    const journalPath = join(
      configuration.agentHubHomeDir,
      'terminal-outbox',
      `${encodeURIComponent(session.id)}.json`,
    );
    const journal = new TerminalOutboxJournal(journalPath);
    const crashed = spawnJournalChild('crash-after-post', sessionPayload, credentials.token, configuration.serverUrl);
    await waitForOutput(crashed, 'post-ack', 15_000);
    const crashExit = waitForExit(crashed);
    await expect(crashExit).resolves.toMatchObject({ signal: 'SIGKILL' });
    expect(journal.load()).toHaveLength(1);

    const replay = spawnJournalChild('replay', sessionPayload, credentials.token, configuration.serverUrl);
    await waitForOutput(replay, 'replayed', 15_000);
    await waitForExit(replay);
    await waitFor(async () => {
      const recoveredJournal = new TerminalOutboxJournal(journalPath);
      return recoveredJournal.load().length === 0;
    }, 10_000, 100);

    const messagesResponse = await fetch(`${configuration.serverUrl}/v3/sessions/${encodeURIComponent(session.id)}/messages?after_seq=0&limit=100`, {
      headers: { Authorization: `Bearer ${credentials.token}` },
    });
    expect(messagesResponse.ok).toBe(true);
    const messagesPayload = await messagesResponse.json() as { messages: Array<{ content?: { t?: string; c?: string } }> };
    const replayed = messagesPayload.messages
      .map((message) => message.content?.t === 'encrypted' && message.content.c
        ? decrypt(session.encryptionKey, session.encryptionVariant, decodeBase64(message.content.c))
        : null)
      .filter((content: any) => content?.content?.data?.message === 'post-success crash replay');
    expect(replayed).toHaveLength(1);
  });
});
