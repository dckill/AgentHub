import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdateContainer } from './apiTypes';
import {
    dispatchRealtimeUpdate,
    type RealtimeUpdateDispatchParams,
} from './realtimeUpdateDispatch';

const envelope = (): ApiUpdateContainer => ({
    id: 'update-1',
    seq: 1,
    createdAt: 10,
    body: {
        t: 'new-session',
        id: 'session-1',
        createdAt: 10,
        updatedAt: 10,
    },
});

describe('realtime update dispatch', () => {
    it('stops at the first dispatcher that handles the update', async () => {
        const calls: string[] = [];
        const params = {
            envelope: envelope(),
            message: {},
            session: {},
            account: {},
            machine: {},
            artifact: {},
            dispatchNewMessage: vi.fn(async () => {
                calls.push('message');
                return false;
            }),
            dispatchSession: vi.fn(async () => {
                calls.push('session');
                return true;
            }),
            dispatchAccount: vi.fn(async () => {
                calls.push('account');
                return true;
            }),
            dispatchMachine: vi.fn(async () => {
                calls.push('machine');
                return true;
            }),
            dispatchArtifact: vi.fn(async () => {
                calls.push('artifact');
                return true;
            }),
        } as unknown as RealtimeUpdateDispatchParams;

        await dispatchRealtimeUpdate(params);

        expect(calls).toEqual(['message', 'session']);
        expect(params.dispatchAccount).not.toHaveBeenCalled();
        expect(params.dispatchMachine).not.toHaveBeenCalled();
        expect(params.dispatchArtifact).not.toHaveBeenCalled();
    });

    it('runs through the full chain when no dispatcher handles the update', async () => {
        const calls: string[] = [];
        const params = {
            envelope: envelope(),
            message: {},
            session: {},
            account: {},
            machine: {},
            artifact: {},
            dispatchNewMessage: vi.fn(async () => { calls.push('message'); return false; }),
            dispatchSession: vi.fn(async () => { calls.push('session'); return false; }),
            dispatchAccount: vi.fn(async () => { calls.push('account'); return false; }),
            dispatchMachine: vi.fn(async () => { calls.push('machine'); return false; }),
            dispatchArtifact: vi.fn(async () => { calls.push('artifact'); return false; }),
        } as unknown as RealtimeUpdateDispatchParams;

        await dispatchRealtimeUpdate(params);

        expect(calls).toEqual(['message', 'session', 'account', 'machine', 'artifact']);
    });
});
