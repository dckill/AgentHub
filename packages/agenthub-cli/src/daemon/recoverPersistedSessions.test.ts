import { describe, expect, it } from 'vitest';
import { encodeBase64 } from '@/api/encryption';
import type { PersistedSession } from '@/persistence';
import { recoverPersistedDaemonSessions } from './recoverPersistedSessions';

const key = encodeBase64(new Uint8Array(32));

function persistedSession(overrides: Partial<PersistedSession> & { hostPid?: number } = {}): PersistedSession {
    const hostPid = overrides.hostPid ?? 1234;
    return {
        encryptionKey: key,
        encryptionVariant: 'legacy',
        seq: 7,
        metadataVersion: 2,
        agentStateVersion: 3,
        metadata: {
            path: '/repo',
            host: 'host',
            homeDir: '/home/user',
            agentHubHomeDir: '/home/user/.agenthub',
            agentHubLibDir: '/repo/packages/agenthub-cli',
            agentHubToolsDir: '/repo/packages/agenthub-cli/tools/unpacked',
            startedFromDaemon: true,
            startedBy: 'daemon',
            hostPid,
            lifecycleState: 'running',
            flavor: 'codex',
            ...overrides.metadata,
        } as any,
        savedAt: overrides.savedAt ?? 1,
        ...overrides,
    };
}

describe('recoverPersistedDaemonSessions', () => {
    it('recovers persisted daemon-spawned sessions that still have a matching live process', () => {
        const recovered = recoverPersistedDaemonSessions({
            'session-1': persistedSession({ hostPid: 1234 }),
        }, [
            {
                pid: 1234,
                name: 'MainThread',
                cmd: 'node /repo/packages/agenthub-cli/dist/index.mjs codex --agenthub-starting-mode remote --started-by daemon',
            },
        ]);

        expect(recovered).toHaveLength(1);
        expect(recovered[0]).toMatchObject({
            startedBy: 'daemon',
            agentHubSessionId: 'session-1',
            pid: 1234,
            encryption: {
                encryptionVariant: 'legacy',
                seq: 7,
                metadataVersion: 2,
                agentStateVersion: 3,
            },
        });
    });

    it('does not recover archived, terminal-started, dead, or PID-reused sessions', () => {
        const recovered = recoverPersistedDaemonSessions({
            archived: persistedSession({
                hostPid: 10,
                metadata: { lifecycleState: 'archived' } as any,
            }),
            terminal: persistedSession({
                hostPid: 11,
                metadata: { startedFromDaemon: false, startedBy: 'terminal' } as any,
            }),
            dead: persistedSession({ hostPid: 12 }),
            reused: persistedSession({ hostPid: 13 }),
        }, [
            {
                pid: 10,
                name: 'MainThread',
                cmd: 'node /repo/packages/agenthub-cli/dist/index.mjs codex --agenthub-starting-mode remote --started-by daemon',
            },
            {
                pid: 11,
                name: 'MainThread',
                cmd: 'node /repo/packages/agenthub-cli/dist/index.mjs codex --agenthub-starting-mode remote --started-by daemon',
            },
            {
                pid: 13,
                name: 'bash',
                cmd: '/bin/bash',
            },
        ]);

        expect(recovered).toEqual([]);
    });

    it('keeps the newest persisted session when duplicate records point at the same PID', () => {
        const recovered = recoverPersistedDaemonSessions({
            older: persistedSession({ hostPid: 1234, savedAt: 1 }),
            newer: persistedSession({ hostPid: 1234, savedAt: 2 }),
        }, [
            {
                pid: 1234,
                name: 'MainThread',
                cmd: 'node /repo/packages/agenthub-cli/dist/index.mjs codex --agenthub-starting-mode remote --started-by daemon',
            },
        ]);

        expect(recovered).toHaveLength(1);
        expect(recovered[0].agentHubSessionId).toBe('newer');
    });
});
