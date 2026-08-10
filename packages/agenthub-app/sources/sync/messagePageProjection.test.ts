import { describe, expect, it } from 'vitest';
import { projectDecryptedMessages } from './messagePageProjection';

describe('projectDecryptedMessages', () => {
    it('normalizes renderable messages and keeps the latest lifecycle thinking state', () => {
        const result = projectDecryptedMessages([
            {
                id: 'user-1',
                seq: 1,
                localId: null,
                createdAt: 10,
                content: { role: 'user', content: { type: 'text', text: 'hello' } },
            },
            {
                id: 'lifecycle-1',
                seq: 2,
                localId: null,
                createdAt: 11,
                content: {
                    role: 'agent',
                    content: { type: 'acp', provider: 'claude', data: { type: 'task_started', id: 'task-1' } },
                },
            },
        ]);

        expect(result.normalizedMessages).toHaveLength(1);
        expect(result.normalizedMessages[0]).toMatchObject({ id: 'user-1', role: 'user' });
        expect(result.lifecycleThinkingState).toBe(true);
    });

    it('skips malformed messages without changing a previously observed lifecycle state', () => {
        const result = projectDecryptedMessages([
            {
                id: 'lifecycle-1',
                seq: 1,
                localId: null,
                createdAt: 11,
                content: {
                    role: 'agent',
                    content: { type: 'acp', provider: 'claude', data: { type: 'task_started', id: 'task-1' } },
                },
            },
            { id: 'bad-1', seq: 2, localId: null, createdAt: 12, content: { role: 'unknown' } },
        ]);

        expect(result.normalizedMessages).toHaveLength(0);
        expect(result.lifecycleThinkingState).toBe(true);
    });
});
