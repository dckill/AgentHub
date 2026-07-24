import { describe, expect, it, vi } from 'vitest';

import { connectOfficialCodexSession } from './connectOfficialCodexSession';

describe('connectOfficialCodexSession', () => {
    it('warms the spawned session and message sync before navigating to it', async () => {
        const calls: string[] = [];
        const spawnSession = vi.fn(async () => {
            calls.push('spawn');
            return { type: 'success' as const, sessionId: 'session-1' };
        });
        const ensureSessionLoaded = vi.fn(async () => {
            calls.push('ensure-session');
        });
        const onSessionVisible = vi.fn(() => {
            calls.push('messages-visible');
        });
        const startOfficialResumeSession = vi.fn(() => {
            calls.push('mark-official-resume');
        });
        const navigateToSession = vi.fn(() => {
            calls.push('navigate');
        });

        await connectOfficialCodexSession({
            session: {
                source: 'official-codex',
                machineId: 'machine-1',
                path: '/repo',
                codexThreadId: 'thread-1',
                name: 'Official investigation title',
            },
            spawnSession,
            ensureSessionLoaded,
            onSessionVisible,
            startOfficialResumeSession,
            navigateToSession,
        });

        expect(spawnSession).toHaveBeenCalledWith({
            machineId: 'machine-1',
            directory: '/repo',
            agent: 'codex',
            officialMirrorCodexThreadId: 'thread-1',
            officialMirrorClaudeSessionId: undefined,
        });
        expect(ensureSessionLoaded).toHaveBeenCalledWith('session-1');
        expect(onSessionVisible).toHaveBeenCalledWith('session-1');
        expect(startOfficialResumeSession).toHaveBeenCalledWith('session-1', 'thread-1', 'Official investigation title');
        expect(navigateToSession).toHaveBeenCalledWith('session-1');
        expect(calls).toEqual([
            'spawn',
            'ensure-session',
            'messages-visible',
            'mark-official-resume',
            'navigate',
        ]);
    });

    it('does nothing when the official Codex row is missing required fields', async () => {
        const spawnSession = vi.fn();
        const navigateToSession = vi.fn();

        await connectOfficialCodexSession({
            session: {
                source: 'official-codex',
                machineId: 'machine-1',
                path: null,
                codexThreadId: 'thread-1',
            },
            spawnSession,
            ensureSessionLoaded: vi.fn(),
            onSessionVisible: vi.fn(),
            startOfficialResumeSession: vi.fn(),
            navigateToSession,
        });

        expect(spawnSession).not.toHaveBeenCalled();
        expect(navigateToSession).not.toHaveBeenCalled();
    });

    it('starts a mirror session for an official Claude row', async () => {
        const spawnSession = vi.fn(async () => ({ type: 'success' as const, sessionId: 'session-2' }));
        const ensureSessionLoaded = vi.fn(async () => {});
        const onSessionVisible = vi.fn();
        const startOfficialResumeSession = vi.fn();
        const navigateToSession = vi.fn();

        await connectOfficialCodexSession({
            session: {
                source: 'official-claude',
                machineId: 'machine-1',
                path: '/repo',
                claudeSessionId: '93a9705e-bc6a-406d-8dce-8acc014dedbd',
                name: 'Claude investigation',
            },
            spawnSession,
            ensureSessionLoaded,
            onSessionVisible,
            startOfficialResumeSession,
            navigateToSession,
        });

        expect(spawnSession).toHaveBeenCalledWith({
            machineId: 'machine-1',
            directory: '/repo',
            agent: 'claude',
            officialMirrorCodexThreadId: undefined,
            officialMirrorClaudeSessionId: '93a9705e-bc6a-406d-8dce-8acc014dedbd',
        });
        expect(startOfficialResumeSession).toHaveBeenCalledWith('session-2', '93a9705e-bc6a-406d-8dce-8acc014dedbd', 'Claude investigation');
        expect(navigateToSession).toHaveBeenCalledWith('session-2');
    });
});
