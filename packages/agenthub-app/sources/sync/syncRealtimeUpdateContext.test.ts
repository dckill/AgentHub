import { describe, expect, it, vi } from 'vitest';
import {
    createSyncRealtimeUpdateContexts,
    type SyncRealtimeUpdateContextBindings,
} from './syncRealtimeUpdateContext';

describe('Sync realtime update context binding', () => {
    it('binds one account-generation assertion to every realtime branch', () => {
        const assertCurrent = vi.fn();
        const message = { getSession: vi.fn() } as unknown as SyncRealtimeUpdateContextBindings['message'];
        const session = { getSession: vi.fn() } as unknown as SyncRealtimeUpdateContextBindings['session'];
        const account = { currentProfile: null } as unknown as SyncRealtimeUpdateContextBindings['account'];
        const machine = { getMachine: vi.fn() } as unknown as SyncRealtimeUpdateContextBindings['machine'];
        const artifact = { getArtifact: vi.fn() } as unknown as SyncRealtimeUpdateContextBindings['artifact'];

        const contexts = createSyncRealtimeUpdateContexts({
            generation: 42,
            assertCurrent,
            message,
            session,
            account,
            machine,
            artifact,
        });

        contexts.message.assertCurrent();
        contexts.session.assertCurrent();
        contexts.account.assertCurrent();
        contexts.machine.assertCurrent();
        contexts.artifact.assertCurrent();

        expect(assertCurrent).toHaveBeenCalledTimes(5);
        expect(assertCurrent).toHaveBeenCalledWith(42);
        expect(contexts.message.getSession).toBe(message.getSession);
        expect(contexts.session.getSession).toBe(session.getSession);
        expect(contexts.account.currentProfile).toBeNull();
        expect(contexts.machine.getMachine).toBe(machine.getMachine);
        expect(contexts.artifact.getArtifact).toBe(artifact.getArtifact);
    });
});
