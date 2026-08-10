import { describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';
import type { NormalizedMessage } from './typesRaw';
import { planNewMessageRealtimeEffects } from './newMessageRealtimeEffects';

const session: Session = {
    id: 'session-1',
    seq: 4,
    createdAt: 10,
    updatedAt: 20,
    active: true,
    activeAt: 20,
    metadata: null,
    metadataVersion: 0,
    agentState: null,
    agentStateVersion: 0,
    thinking: false,
    thinkingAt: 0,
    presence: 'online',
    draft: 'keep this draft',
    permissionMode: 'default',
};

const message: NormalizedMessage = {
    id: 'message-1',
    localId: null,
    role: 'user' as const,
    content: { type: 'text', text: 'hello' },
    createdAt: 30,
    isSidechain: false,
};

describe('planNewMessageRealtimeEffects', () => {
    it('projects the session and enqueues a normalized consecutive message', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234);
        expect(planNewMessageRealtimeEffects({
            session,
            update: { seq: 5, createdAt: 30 },
            lifecycleThinkingState: true,
            decision: { action: 'enqueue' },
            message,
        })).toMatchObject({
            session: { seq: 5, updatedAt: 30, thinking: true, thinkingAt: 1234 },
            delivery: 'enqueue',
            message,
        });
        vi.restoreAllMocks();
    });

    it('requests an authoritative refresh when the message cannot be enqueued', () => {
        expect(planNewMessageRealtimeEffects({
            session,
            update: { seq: 7, createdAt: 40 },
            lifecycleThinkingState: null,
            decision: { action: 'enqueue' },
            message: null,
        })).toEqual({
            session: expect.objectContaining({ seq: 7, updatedAt: 40 }),
            delivery: 'refresh',
            message: null,
        });
    });

    it('preserves missing-session recovery and ignores explicit ignore decisions', () => {
        expect(planNewMessageRealtimeEffects({
            session: undefined,
            update: { seq: 5, createdAt: 30 },
            lifecycleThinkingState: null,
            decision: { action: 'refresh' },
            message,
        })).toEqual({ session: null, delivery: 'refresh', message });

        expect(planNewMessageRealtimeEffects({
            session,
            update: { seq: 5, createdAt: 30 },
            lifecycleThinkingState: null,
            decision: { action: 'ignore' },
            message: null,
        })).toMatchObject({ delivery: 'ignore', message: null });
    });
});
