import { describe, expect, it, vi } from 'vitest';
import { handleNewMessageRealtimeUpdate } from './newMessageRealtimeHandler';

const message = {
    id: 'message-1',
    seq: 4,
    localId: null,
    content: { t: 'encrypted' as const, c: 'ciphertext' },
    createdAt: 10,
    updatedAt: 10,
};

const session = {
    id: 'session-1',
    active: true,
    activeAt: 10,
    thinking: false,
    thinkingAt: null,
    updatedAt: 10,
    metadata: null,
    agentState: null,
} as never;

describe('handleNewMessageRealtimeUpdate', () => {
    it('refreshes a missing session without trying to decrypt', async () => {
        const refreshMissingSession = vi.fn();
        const decryptMessage = vi.fn();

        await handleNewMessageRealtimeUpdate({
            update: { t: 'new-message', sid: 'session-1', message },
            seq: 40,
            createdAt: 10,
            session: undefined,
            encryption: { decryptMessage },
            refreshMissingSession,
            invalidateMessages: vi.fn(),
            applySession: vi.fn(),
            enqueueMessage: vi.fn(),
            setLastSeq: vi.fn(),
            isMutableToolCall: vi.fn(),
            invalidateGitStatus: vi.fn(),
            assertCurrent: vi.fn(),
            onDecryptError: vi.fn(),
        });

        expect(refreshMissingSession).toHaveBeenCalledWith('session-1');
        expect(decryptMessage).not.toHaveBeenCalled();
    });

    it('invalidates message sync when decryption fails', async () => {
        const invalidateMessages = vi.fn();
        const onDecryptError = vi.fn();

        await handleNewMessageRealtimeUpdate({
            update: { t: 'new-message', sid: 'session-1', message },
            seq: 40,
            createdAt: 10,
            session,
            encryption: { decryptMessage: vi.fn().mockRejectedValue(new Error('temporary key failure')) },
            refreshMissingSession: vi.fn(),
            invalidateMessages,
            applySession: vi.fn(),
            enqueueMessage: vi.fn(),
            setLastSeq: vi.fn(),
            isMutableToolCall: vi.fn(),
            invalidateGitStatus: vi.fn(),
            assertCurrent: vi.fn(),
            onDecryptError,
        });

        expect(invalidateMessages).toHaveBeenCalledTimes(1);
        expect(onDecryptError).toHaveBeenCalledWith(expect.any(Error), 'session-1');
    });

    it('applies a consecutive message and invalidates git for mutable tools', async () => {
        const applySession = vi.fn();
        const enqueueMessage = vi.fn();
        const setLastSeq = vi.fn();
        const invalidateGitStatus = vi.fn();
        const onUnreadMessage = vi.fn();

        await handleNewMessageRealtimeUpdate({
            update: { t: 'new-message', sid: 'session-1', message },
            seq: 40,
            createdAt: 10,
            session,
            encryption: {
                decryptMessage: vi.fn().mockResolvedValue({
                    id: message.id,
                    seq: message.seq,
                    localId: null,
                    createdAt: message.createdAt,
                    content: {
                        role: 'agent',
                        content: {
                            type: 'output',
                            data: {
                                type: 'user',
                                message: {
                                    role: 'user',
                                    content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'changed' }],
                                },
                                toolUseResult: 'changed',
                                uuid: 'assistant-1',
                            },
                        },
                    },
                }),
            },
            currentLastSeq: 3,
            refreshMissingSession: vi.fn(),
            invalidateMessages: vi.fn(),
            applySession,
            enqueueMessage,
            setLastSeq,
            isMutableToolCall: vi.fn().mockReturnValue(true),
            invalidateGitStatus,
            assertCurrent: vi.fn(),
            onDecryptError: vi.fn(),
            onUnreadMessage,
        });

        expect(applySession).toHaveBeenCalledTimes(1);
        expect(enqueueMessage).toHaveBeenCalledWith(expect.objectContaining({ id: message.id }));
        expect(setLastSeq).toHaveBeenCalledWith(4);
        expect(invalidateGitStatus).toHaveBeenCalledWith('session-1');
        expect(onUnreadMessage).toHaveBeenCalledTimes(1);
    });

    it('refreshes on a sequence gap instead of enqueueing out of order', async () => {
        const invalidateMessages = vi.fn();
        const enqueueMessage = vi.fn();

        await handleNewMessageRealtimeUpdate({
            update: { t: 'new-message', sid: 'session-1', message },
            seq: 40,
            createdAt: 10,
            session,
            encryption: {
                decryptMessage: vi.fn().mockResolvedValue({
                    id: message.id,
                    seq: message.seq,
                    localId: null,
                    createdAt: message.createdAt,
                    content: { role: 'user', content: { type: 'text', text: 'hello' } },
                }),
            },
            currentLastSeq: 1,
            refreshMissingSession: vi.fn(),
            invalidateMessages,
            applySession: vi.fn(),
            enqueueMessage,
            setLastSeq: vi.fn(),
            isMutableToolCall: vi.fn(),
            invalidateGitStatus: vi.fn(),
            assertCurrent: vi.fn(),
            onDecryptError: vi.fn(),
        });

        expect(invalidateMessages).toHaveBeenCalledTimes(1);
        expect(enqueueMessage).not.toHaveBeenCalled();
    });
});
