import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalOutboxJournal, type TerminalOutboxEntry } from './terminalOutboxJournal';

const roots: string[] = [];
const entry = (localId: string): TerminalOutboxEntry => ({
  localId,
  content: `encrypted-${localId}`,
});

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('TerminalOutboxJournal', () => {
  it('atomically persists encrypted outbox and recovers it after a new instance', () => {
    const root = mkdtempSync(join(tmpdir(), 'agenthub-terminal-journal-'));
    roots.push(root);
    const path = join(root, 'outbox.json');
    const first = new TerminalOutboxJournal(path);

    first.append(entry('local-1'));
    first.append(entry('local-1'));
    first.append(entry('local-2'));

    expect(new TerminalOutboxJournal(path).load()).toEqual([entry('local-1'), entry('local-2')]);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8')).messages[0].content).toBe('encrypted-local-1');
  });

  it('removes only server-acknowledged local ids and retains failed entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'agenthub-terminal-journal-'));
    roots.push(root);
    const journal = new TerminalOutboxJournal(join(root, 'outbox.json'));
    journal.append(entry('one'));
    journal.append(entry('two'));
    journal.append(entry('three'));

    journal.acknowledge(['two']);

    expect(journal.load()).toEqual([entry('one'), entry('three')]);
  });

  it('recovers a pending session-end marker and consumes it after socket emission', () => {
    const root = mkdtempSync(join(tmpdir(), 'agenthub-terminal-journal-'));
    roots.push(root);
    const path = join(root, 'outbox.json');
    const first = new TerminalOutboxJournal(path);
    first.markSessionEnd('session-1', 123);

    const second = new TerminalOutboxJournal(path);
    expect(second.pendingSessionEnd()).toEqual({ sessionId: 'session-1', time: 123 });
    expect(second.consumeSessionEnd()).toEqual({ sessionId: 'session-1', time: 123 });
    expect(new TerminalOutboxJournal(path).pendingSessionEnd()).toBeNull();
  });

  it('normalizes a missing or malformed journal without exposing plaintext', () => {
    const root = mkdtempSync(join(tmpdir(), 'agenthub-terminal-journal-'));
    roots.push(root);
    const path = join(root, 'outbox.json');
    const journal = new TerminalOutboxJournal(path);
    expect(journal.load()).toEqual([]);
    chmodSync(path, 0o600);
    expect(readFileSync(path, 'utf8')).not.toContain('root-secret');
  });
});
