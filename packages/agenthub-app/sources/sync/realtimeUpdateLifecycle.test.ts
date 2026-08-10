import { describe, expect, it, vi } from 'vitest';
import { runRealtimeUpdateLifecycle, type RealtimeUpdateLifecycleOptions } from './realtimeUpdateLifecycle';

const context = () => ({
    message: {} as RealtimeUpdateLifecycleOptions['message'],
    session: {} as RealtimeUpdateLifecycleOptions['session'],
    account: {} as RealtimeUpdateLifecycleOptions['account'],
    machine: {} as RealtimeUpdateLifecycleOptions['machine'],
    artifact: {} as RealtimeUpdateLifecycleOptions['artifact'],
});

describe('realtime update lifecycle', () => {
    it('rejects stale updates before parsing or dispatching', async () => {
        const assertCurrent = vi.fn(() => { throw new DOMException('stale', 'AbortError'); });
        const dispatch = vi.fn();

        await expect(runRealtimeUpdateLifecycle({
            update: {},
            generation: 3,
            assertCurrent,
            dispatch,
            ...context(),
            warnInvalid: vi.fn(),
            errorInvalid: vi.fn(),
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(dispatch).not.toHaveBeenCalled();
    });

    it('reports malformed updates without entering branch dispatch', async () => {
        const warnInvalid = vi.fn();
        const errorInvalid = vi.fn();
        const dispatch = vi.fn();

        await runRealtimeUpdateLifecycle({
            update: { malformed: true },
            generation: 4,
            assertCurrent: vi.fn(),
            dispatch,
            ...context(),
            warnInvalid,
            errorInvalid,
        });

        expect(warnInvalid).toHaveBeenCalledOnce();
        expect(errorInvalid).toHaveBeenCalledWith('❌ Sync: Invalid update data:', { malformed: true });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('binds new-message session callbacks to the envelope session id', async () => {
        const dispatch = vi.fn(async (params: { message: { invalidateMessages: () => void } }) => {
            params.message.invalidateMessages();
        });
        const invalidateMessages = vi.fn();

        await runRealtimeUpdateLifecycle({
            update: {
                id: 'u1',
                seq: 2,
                createdAt: 3,
                body: {
                    t: 'new-message',
                    sid: 'session-1',
                    message: {
                        id: 'message-1',
                        seq: 2,
                        content: { t: 'encrypted', c: 'ciphertext' },
                        createdAt: 3,
                        updatedAt: 3,
                    },
                },
            },
            generation: 5,
            assertCurrent: vi.fn(),
            dispatch,
            ...context(),
            message: { ...context().message, invalidateMessages },
            warnInvalid: vi.fn(),
            errorInvalid: vi.fn(),
        } as unknown as RealtimeUpdateLifecycleOptions);

        expect(invalidateMessages).toHaveBeenCalledWith('session-1');
    });
});
