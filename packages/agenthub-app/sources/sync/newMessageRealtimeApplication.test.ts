import { describe, expect, it, vi } from 'vitest';
import type { ApiMessage } from './apiTypes';
import { applyNewMessageRealtimeUpdate } from './newMessageRealtimeApplication';

const message: ApiMessage = {
    id: 'message-1',
    seq: 4,
    localId: null,
    content: { t: 'encrypted', c: 'ciphertext' },
    createdAt: 10,
    updatedAt: 10,
};

describe('applyNewMessageRealtimeUpdate', () => {
    it('keeps decryption failures and empty payloads recoverable', async () => {
        await expect(applyNewMessageRealtimeUpdate({
            message,
            currentLastSeq: 3,
            decrypt: vi.fn().mockRejectedValue(new Error('temporary key failure')),
            assertCurrent: vi.fn(),
        })).resolves.toMatchObject({ kind: 'failed', error: expect.any(Error) });

        await expect(applyNewMessageRealtimeUpdate({
            message,
            currentLastSeq: 3,
            decrypt: vi.fn().mockResolvedValue(null),
            assertCurrent: vi.fn(),
        })).resolves.toEqual({ kind: 'empty' });
    });

    it('returns an enqueue plan for a normalized consecutive message', async () => {
        await expect(applyNewMessageRealtimeUpdate({
            message,
            currentLastSeq: 3,
            decrypt: vi.fn().mockResolvedValue({
                id: 'message-1',
                seq: 4,
                localId: null,
                createdAt: 10,
                content: { role: 'user', content: { type: 'text', text: 'hello' } },
            }),
            assertCurrent: vi.fn(),
        })).resolves.toMatchObject({
            kind: 'applied',
            decision: { action: 'enqueue' },
            lifecycleThinkingState: null,
            normalized: { id: 'message-1', role: 'user' },
        });
    });
});
