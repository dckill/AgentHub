import { describe, expect, it, vi } from 'vitest';
import { enqueueTextMessage } from './sendTextMessageApplication';

const content = {
    role: 'user' as const,
    content: { type: 'text' as const, text: 'hello' },
    meta: {
        sentFrom: 'web',
        turnOriginDevice: 'device-1',
        permissionMode: 'default' as const,
        model: null,
        effort: null,
        fallbackModel: null,
        appendSystemPrompt: '',
    },
};

describe('enqueueTextMessage', () => {
    it('encrypts, projects, and queues a user message in order', async () => {
        const encrypted = vi.fn(async () => 'encrypted-content');
        const normalize = vi.fn((localId: string, messageId: string, createdAt: number, record: typeof content) => ({
            localId,
            messageId,
            createdAt,
            record,
        }));
        const enqueueMessages = vi.fn();
        const enqueueOutbox = vi.fn();

        const result = await enqueueTextMessage({
            sessionId: 'session-1',
            content,
            createId: () => 'local-1',
            now: () => 1234,
            encryptRawRecord: encrypted,
            normalizeRawMessage: normalize,
            enqueueMessages,
            enqueueOutbox,
        });

        expect(result).toEqual({ localId: 'local-1' });
        expect(encrypted).toHaveBeenCalledWith(content);
        expect(normalize).toHaveBeenCalledWith('local-1', 'local-1', 1234, content);
        expect(enqueueMessages).toHaveBeenCalledWith('session-1', [expect.objectContaining({ localId: 'local-1' })]);
        expect(enqueueOutbox).toHaveBeenCalledWith('session-1', {
            localId: 'local-1',
            content: 'encrypted-content',
        });
    });

    it('still queues encrypted content when local normalization rejects it', async () => {
        const enqueueMessages = vi.fn();
        const enqueueOutbox = vi.fn();

        await enqueueTextMessage({
            sessionId: 'session-1',
            content,
            createId: () => 'local-1',
            now: () => 1234,
            encryptRawRecord: async () => 'encrypted-content',
            normalizeRawMessage: () => null,
            enqueueMessages,
            enqueueOutbox,
        });

        expect(enqueueMessages).not.toHaveBeenCalled();
        expect(enqueueOutbox).toHaveBeenCalledOnce();
    });

    it('propagates encryption failures before any outbox write', async () => {
        const error = new Error('encryption failed');
        const enqueueOutbox = vi.fn();

        await expect(enqueueTextMessage({
            sessionId: 'session-1',
            content,
            createId: () => 'local-1',
            now: () => 1234,
            encryptRawRecord: async () => { throw error; },
            normalizeRawMessage: vi.fn(),
            enqueueMessages: vi.fn(),
            enqueueOutbox,
        })).rejects.toBe(error);

        expect(enqueueOutbox).not.toHaveBeenCalled();
    });

    it('stops local projection when the account becomes stale during encryption', async () => {
        let currentGeneration = true;
        const enqueueMessages = vi.fn();
        const enqueueOutbox = vi.fn();

        await enqueueTextMessage({
            sessionId: 'session-1',
            content,
            createId: () => 'local-1',
            now: () => 1234,
            encryptRawRecord: async () => {
                currentGeneration = false;
                return 'encrypted-content';
            },
            normalizeRawMessage: () => ({ id: 'message-1' }),
            enqueueMessages,
            enqueueOutbox,
            isCurrent: () => currentGeneration,
        });

        expect(enqueueMessages).not.toHaveBeenCalled();
        expect(enqueueOutbox).not.toHaveBeenCalled();
    });
});
