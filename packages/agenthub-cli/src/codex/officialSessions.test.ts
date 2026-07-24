import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listOfficialCodexThreadStatesForMachine, listOfficialCodexThreadsForMachine } from './officialSessions';

const execFileAsync = promisify(execFile);

describe('listOfficialCodexThreadsForMachine', () => {
    let testDir: string;
    let previousCodexHome: string | undefined;

    beforeEach(async () => {
        testDir = join(tmpdir(), `official-codex-sessions-${Date.now()}`);
        previousCodexHome = process.env.CODEX_HOME;
        process.env.CODEX_HOME = testDir;
        await mkdir(join(testDir, 'sessions'), { recursive: true });
        await execFileAsync('sqlite3', [join(testDir, 'state_5.sqlite'), `
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  cwd TEXT,
  title TEXT,
  archived INTEGER,
  git_branch TEXT,
  preview TEXT,
  created_at_ms INTEGER,
  updated_at_ms INTEGER,
  recency_at_ms INTEGER,
  rollout_path TEXT
);
`]);
    });

    afterEach(async () => {
        if (previousCodexHome === undefined) {
            delete process.env.CODEX_HOME;
        } else {
            process.env.CODEX_HOME = previousCodexHome;
        }
        await rm(testDir, { recursive: true, force: true });
    });

    it('does not list active DB rows when the active rollout file was deleted or archived away', async () => {
        await execFileAsync('sqlite3', [join(testDir, 'state_5.sqlite'), `
INSERT INTO threads (id, cwd, title, archived, git_branch, preview, created_at_ms, updated_at_ms, recency_at_ms, rollout_path)
VALUES ('thread-deleted', '/repo', 'Deleted session', 0, 'main', NULL, 1, 2, 3, 'sessions/2026/07/07/rollout-thread-deleted.jsonl');
`]);

        await expect(listOfficialCodexThreadsForMachine('machine-1', new Set())).resolves.toEqual([]);
    });

    it('lists active DB rows only when an active rollout file still exists', async () => {
        const rolloutPath = join(testDir, 'sessions', '2026', '07', '07', 'rollout-thread-live.jsonl');
        await mkdir(join(testDir, 'sessions', '2026', '07', '07'), { recursive: true });
        await writeFile(rolloutPath, JSON.stringify({
            type: 'session_meta',
            payload: { cwd: '/repo', timestamp: '2026-07-07T00:00:00.000Z' },
        }) + '\n', 'utf8');
        await execFileAsync('sqlite3', [join(testDir, 'state_5.sqlite'), `
INSERT INTO threads (id, cwd, title, archived, git_branch, preview, created_at_ms, updated_at_ms, recency_at_ms, rollout_path)
VALUES ('thread-live', '/repo', 'Live session', 0, 'main', NULL, 1, 2, 3, 'sessions/2026/07/07/rollout-thread-live.jsonl');
`]);

        await expect(listOfficialCodexThreadsForMachine('machine-1', new Set())).resolves.toEqual([
            expect.objectContaining({
                id: 'thread-live',
                title: 'Live session',
                provider: 'codex',
            }),
        ]);
    });

    it('reports archived state for requested DB rows', async () => {
        await execFileAsync('sqlite3', [join(testDir, 'state_5.sqlite'), `
INSERT INTO threads (id, cwd, title, archived, git_branch, preview, created_at_ms, updated_at_ms, recency_at_ms, rollout_path)
VALUES
  ('thread-live', '/repo', 'Live session', 0, 'main', NULL, 1, 2, 3, 'sessions/rollout-thread-live.jsonl'),
  ('thread-archived', '/repo', 'Archived session', 1, 'main', NULL, 1, 2, 3, 'archived_sessions/rollout-thread-archived.jsonl');
`]);

        await expect(listOfficialCodexThreadStatesForMachine(['thread-live', 'thread-archived', 'thread-missing'])).resolves.toEqual(
            expect.arrayContaining([
                { id: 'thread-live', archived: false },
                { id: 'thread-archived', archived: true },
            ]),
        );
    });
});
