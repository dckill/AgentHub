import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { TerminalOutboxJournal } from './terminalOutboxJournal';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('TerminalOutboxJournal process recovery', () => {
  it('retains an entry when the writer process is terminated after the atomic write', async () => {
    const root = mkdtempSync(join(tmpdir(), 'agenthub-terminal-journal-process-'));
    roots.push(root);
    const journalPath = join(root, 'outbox.json');
    const modulePath = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'terminalOutboxJournal.ts')).href;
    const script = [
      `import { TerminalOutboxJournal } from ${JSON.stringify(modulePath)};`,
      `const journal = new TerminalOutboxJournal(${JSON.stringify(journalPath)});`,
      `journal.append({ localId: 'crash-local-id', content: 'encrypted-crash-entry' });`,
      `journal.markSessionEnd('crash-session-id', 123);`,
      `process.stdout.write('ready\\n');`,
      `setInterval(() => {}, 1000);`,
    ].join('\n');

    const child = spawn(process.execPath, ['--import', 'tsx/esm', '--input-type=module', '-e', script], {
      cwd: join(dirname(fileURLToPath(import.meta.url)), '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('journal child did not become ready')), 5000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('ready')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    child.kill('SIGTERM');
    const exit = await new Promise<{ signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('exit', (_code, signal) => resolve({ signal }));
      child.once('error', reject);
    });

    expect(exit.signal).toBe('SIGTERM');
    expect(new TerminalOutboxJournal(journalPath).load()).toEqual([
      { localId: 'crash-local-id', content: 'encrypted-crash-entry' },
    ]);
    const recovered = new TerminalOutboxJournal(journalPath);
    expect(recovered.pendingSessionEnd()).toEqual({ sessionId: 'crash-session-id', time: 123 });
    expect(recovered.consumeSessionEnd()).toEqual({ sessionId: 'crash-session-id', time: 123 });
  });
});
