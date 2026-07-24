import { describe, expect, it, vi } from 'vitest';
import { closeClaudeSessionAndResources, createClaudeShutdownOnce } from './claudeShutdown';
import type { Metadata } from '@/api/types';

describe('closeClaudeSessionAndResources', () => {
    it('closes an active turn before sending session-end during shutdown', async () => {
        const calls: string[] = [];
        const baseMetadata: Metadata = {
            path: '/workspace',
            host: 'dev',
            homeDir: '/home/dev',
            agentHubHomeDir: '/home/dev/.agenthub',
            agentHubLibDir: '/opt/agenthub',
            agentHubToolsDir: '/opt/agenthub/tools',
            lifecycleState: 'running',
        };
        const session = {
            closeClaudeSessionTurn: vi.fn(() => {
                calls.push('turn-end');
            }),
            updateMetadata: vi.fn((updater: (metadata: Metadata) => Metadata) => {
                calls.push('metadata');
                updater(baseMetadata);
            }),
            sendSessionDeath: vi.fn(() => {
                calls.push('session-end');
            }),
            flush: vi.fn(async () => {
                calls.push('flush');
            }),
            close: vi.fn(async () => {
                calls.push('close');
            }),
        };
        const currentSession = {
            cleanup: vi.fn(() => {
                calls.push('current-session-cleanup');
            }),
        };
        const goalScanner = {
            cleanup: vi.fn(async () => {
                calls.push('goal-scanner-cleanup');
            }),
        };
        const agenthubServer = {
            stop: vi.fn(() => {
                calls.push('agenthub-stop');
            }),
        };
        const hookServer = {
            stop: vi.fn(() => {
                calls.push('hook-stop');
            }),
        };
        const cleanupHookSettingsFile = vi.fn(() => {
            calls.push('hook-settings-cleanup');
        });

        await closeClaudeSessionAndResources({
            session,
            currentSession,
            goalScanner,
            agenthubServer,
            hookServer,
            hookSettingsPath: '/tmp/agenthub-hook.json',
            cleanupHookSettingsFile,
            archiveReason: 'User terminated',
            turnStatus: 'cancelled',
        });

        expect(session.closeClaudeSessionTurn).toHaveBeenCalledWith('cancelled');
        expect(calls.indexOf('turn-end')).toBeLessThan(calls.indexOf('session-end'));
        expect(calls).toEqual([
            'metadata',
            'turn-end',
            'current-session-cleanup',
            'goal-scanner-cleanup',
            'session-end',
            'flush',
            'close',
            'agenthub-stop',
            'hook-stop',
            'hook-settings-cleanup',
        ]);
    });

    it('turns off thinking before cleaning up the live Claude session', async () => {
        const calls: string[] = [];
        const session = {
            closeClaudeSessionTurn: vi.fn(() => {
                calls.push('turn-end');
            }),
            updateMetadata: vi.fn((updater: (metadata: Metadata) => Metadata) => {
                updater({ path: '/workspace', host: 'dev', lifecycleState: 'running' } as Metadata);
            }),
            sendSessionDeath: vi.fn(() => {
                calls.push('session-end');
            }),
            flush: vi.fn(async () => undefined),
            close: vi.fn(async () => undefined),
        };
        const currentSession = {
            thinking: true,
            onThinkingChange: vi.fn((thinking: boolean) => {
                calls.push(`thinking:${thinking}`);
            }),
            cleanup: vi.fn(() => {
                calls.push('current-session-cleanup');
            }),
        };

        await closeClaudeSessionAndResources({
            session,
            currentSession,
            goalScanner: { cleanup: vi.fn(async () => undefined) },
            agenthubServer: { stop: vi.fn() },
            hookServer: { stop: vi.fn() },
            hookSettingsPath: '/tmp/agenthub-hook.json',
            cleanupHookSettingsFile: vi.fn(),
            archiveReason: 'Received SIGTERM',
            turnStatus: 'cancelled',
        });

        expect(currentSession.onThinkingChange).toHaveBeenCalledWith(false);
        expect(calls.indexOf('turn-end')).toBeLessThan(calls.indexOf('thinking:false'));
        expect(calls.indexOf('thinking:false')).toBeLessThan(calls.indexOf('current-session-cleanup'));
        expect(calls.indexOf('thinking:false')).toBeLessThan(calls.indexOf('session-end'));
    });

    it('runs the shutdown sequence only once when multiple exit signals race', async () => {
        let resolveClose!: () => void;
        const close = vi.fn((_reason: string) => new Promise<void>((resolve) => {
            resolveClose = resolve;
        }));
        const shutdownOnce = createClaudeShutdownOnce(close);

        const first = shutdownOnce('SIGTERM');
        const second = shutdownOnce('archive');

        expect(close).toHaveBeenCalledTimes(1);
        expect(close).toHaveBeenCalledWith('SIGTERM');

        resolveClose();
        await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
        expect(close).toHaveBeenCalledTimes(1);
    });
});
