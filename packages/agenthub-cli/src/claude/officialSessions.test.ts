import { mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listOfficialClaudeSessionsForMachine } from './officialSessions';

describe('listOfficialClaudeSessionsForMachine', () => {
    let testDir: string;
    let previousClaudeConfigDir: string | undefined;

    beforeEach(async () => {
        testDir = join(tmpdir(), `official-claude-sessions-${Date.now()}`);
        previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = testDir;
        await mkdir(join(testDir, 'projects', '-repo'), { recursive: true });
    });

    afterEach(async () => {
        if (previousClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir;
        }
        await rm(testDir, { recursive: true, force: true });
    });

    it('lists top-level Claude transcript files as official sessions', async () => {
        const sessionId = '93a9705e-bc6a-406d-8dce-8acc014dedbd';
        await writeFile(join(testDir, 'projects', '-repo', `${sessionId}.jsonl`), [
            JSON.stringify({
                type: 'user',
                uuid: 'u1',
                timestamp: '2026-07-01T10:00:00.000Z',
                cwd: '/home/me/repo',
                gitBranch: 'main',
                message: { role: 'user', content: 'first prompt' },
            }),
            JSON.stringify({
                type: 'user',
                uuid: 'u2',
                timestamp: '2026-07-01T10:05:00.000Z',
                cwd: '/home/me/repo',
                gitBranch: 'main',
                message: { role: 'user', content: [{ type: 'text', text: 'newer prompt' }] },
            }),
            '',
        ].join('\n'), 'utf8');
        await mkdir(join(testDir, 'projects', '-repo', sessionId, 'subagents'), { recursive: true });
        await writeFile(join(testDir, 'projects', '-repo', sessionId, 'subagents', 'agent-1.jsonl'), '{}\n', 'utf8');

        const sessions = await listOfficialClaudeSessionsForMachine('machine-1', new Set());

        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({
            id: sessionId,
            machineId: 'machine-1',
            cwd: '/home/me/repo',
            title: 'newer prompt',
            provider: 'claude',
            archived: false,
            gitBranch: 'main',
        });
    });

    it('respects ignored Claude session ids', async () => {
        const sessionId = '93a9705e-bc6a-406d-8dce-8acc014dedbd';
        await writeFile(join(testDir, 'projects', '-repo', `${sessionId}.jsonl`), JSON.stringify({
            type: 'user',
            uuid: 'u1',
            timestamp: '2026-07-01T10:00:00.000Z',
            cwd: '/home/me/repo',
            message: { role: 'user', content: 'first prompt' },
        }) + '\n', 'utf8');

        await expect(listOfficialClaudeSessionsForMachine('machine-1', new Set([`claude:${sessionId}`]))).resolves.toEqual([]);
    });

    it('stops listing Claude sessions after the local transcript file is deleted', async () => {
        const sessionId = '93a9705e-bc6a-406d-8dce-8acc014dedbd';
        const transcriptPath = join(testDir, 'projects', '-repo', `${sessionId}.jsonl`);
        await writeFile(transcriptPath, JSON.stringify({
            type: 'user',
            uuid: 'u1',
            timestamp: '2026-07-01T10:00:00.000Z',
            cwd: '/home/me/repo',
            message: { role: 'user', content: 'first prompt' },
        }) + '\n', 'utf8');

        await expect(listOfficialClaudeSessionsForMachine('machine-1', new Set())).resolves.toHaveLength(1);
        await unlink(transcriptPath);
        await expect(listOfficialClaudeSessionsForMachine('machine-1', new Set())).resolves.toEqual([]);
    });
});
