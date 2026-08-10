import { describe, expect, it } from 'vitest';
import { runCodexDisconnectLifecycle } from './codexDisconnectLifecycle';

describe('runCodexDisconnectLifecycle', () => {
    it('terminates transport before projecting state, rejects the epoch, settles the turn, and awaits sandbox cleanup', async () => {
        const events: string[] = [];
        const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; method: string; epoch: number }>();
        let rejectedError: Error | undefined;
        pending.set(1, {
            resolve: () => {},
            reject: (error) => { rejectedError = error; events.push('reject'); },
            method: 'thread/read',
            epoch: 7,
        });
        const disconnectedTurnIds = new Set<string>();
        let sandboxCleaned = false;

        await runCodexDisconnectLifecycle({
            preserveThreadState: true,
            proc: { stdin: { end: () => events.push('stdin-end') }, kill: () => events.push('kill') },
            readline: { close: () => events.push('readline-close') },
            pid: 123,
            epoch: 7,
            pendingTurnId: 'turn-7',
            disconnectedTurnIds,
            pending,
            sandboxCleanup: async () => {
                events.push('sandbox-start');
                await Promise.resolve();
                sandboxCleaned = true;
                events.push('sandbox-done');
            },
            terminateProcess: () => {
                events.push('terminate');
            },
            setReadline: () => events.push('readline-null'),
            setProcess: () => events.push('process-null'),
            setConnected: () => events.push('disconnected'),
            setSandboxCleanup: () => events.push('sandbox-null'),
            setSandboxEnabled: () => events.push('sandbox-disabled'),
            setTurnId: () => events.push('turn-null'),
            setNotificationProtocol: () => events.push('protocol-reset'),
            clearThreadState: () => events.push('thread-cleared'),
            resolvePendingTurn: () => events.push('turn-resolved'),
        });

        expect(events).toEqual([
            'readline-null',
            'terminate',
            'process-null',
            'disconnected',
            'turn-null',
            'protocol-reset',
            'reject',
            'turn-resolved',
            'sandbox-start',
            'sandbox-done',
            'sandbox-null',
            'sandbox-disabled',
        ]);
        expect(rejectedError).toBeInstanceOf(Error);
        expect((rejectedError as Error).message).toContain('thread/read');
        expect(pending).toEqual(new Map());
        expect(disconnectedTurnIds).toEqual(new Set(['turn-7']));
        expect(sandboxCleaned).toBe(true);
    });

    it('clears thread state when the disconnect is not preserving a reconnectable thread', async () => {
        const events: string[] = [];

        await runCodexDisconnectLifecycle({
            preserveThreadState: false,
            proc: null,
            readline: null,
            epoch: 2,
            pendingTurnId: null,
            disconnectedTurnIds: new Set(),
            pending: new Map(),
            sandboxCleanup: null,
            terminateProcess: () => {},
            setReadline: () => {},
            setProcess: () => {},
            setConnected: () => {},
            setSandboxCleanup: () => {},
            setSandboxEnabled: () => {},
            setTurnId: () => {},
            setNotificationProtocol: () => {},
            clearThreadState: () => events.push('thread-cleared'),
            resolvePendingTurn: () => {},
        });

        expect(events).toEqual(['thread-cleared']);
    });
});
