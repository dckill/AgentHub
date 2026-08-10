import { describe, expect, it, vi } from 'vitest';

import { resumeExistingThread } from './resumeExistingThread';

describe('resumeExistingThread', () => {
    it('can resume a side-chat thread without publishing a synthetic resume message', async () => {
        const client = {
            resumeThread: vi.fn().mockResolvedValue({ threadId: 'thread-side', model: 'gpt-5.4' }),
        };
        const session = {
            updateMetadata: vi.fn(),
            sendSessionEvent: vi.fn(),
        };
        const messageBuffer = { addMessage: vi.fn() };

        await resumeExistingThread({
            client,
            session,
            messageBuffer,
            threadId: 'thread-side',
            cwd: '/tmp/project',
            mcpServers: {},
            announce: false,
        });

        expect(messageBuffer.addMessage).not.toHaveBeenCalled();
        expect(session.sendSessionEvent).not.toHaveBeenCalled();
    });

    it('resumes the thread and updates session metadata', async () => {
        const client = {
            resumeThread: vi.fn().mockResolvedValue({
                threadId: '019ccca2-1a77-7481-9873-de72f3464372',
                model: 'gpt-5.4',
            }),
        };
        const metadataHandlers: Array<(metadata: any) => any> = [];
        const session = {
            updateMetadata: vi.fn((handler) => metadataHandlers.push(handler)),
            sendSessionEvent: vi.fn(),
        };
        const messageBuffer = {
            addMessage: vi.fn(),
        };

        const result = await resumeExistingThread({
            client,
            session,
            messageBuffer,
            threadId: '019ccca2-1a77-7481-9873-de72f3464372',
            cwd: '/tmp/project',
            mcpServers: { agenthub: { command: 'agenthub-mcp' } },
        });

        expect(result).toEqual({
            threadId: '019ccca2-1a77-7481-9873-de72f3464372',
            model: 'gpt-5.4',
        });
        expect(client.resumeThread).toHaveBeenCalledWith({
            threadId: '019ccca2-1a77-7481-9873-de72f3464372',
            cwd: '/tmp/project',
            mcpServers: { agenthub: { command: 'agenthub-mcp' } },
        });
        expect(metadataHandlers).toHaveLength(1);
        expect(metadataHandlers[0]({ existing: true })).toEqual({
            existing: true,
            codexThreadId: '019ccca2-1a77-7481-9873-de72f3464372',
        });
        expect(messageBuffer.addMessage).toHaveBeenCalledWith(expect.stringContaining('Resumed thread'), 'status');
        expect(session.sendSessionEvent).toHaveBeenCalledWith({
            type: 'message',
            message: 'Resumed Codex thread 019ccca2-1a77-7481-9873-de72f3464372',
        });
    });

    it('preserves the official Codex thread title as the AgentHub session summary', async () => {
        const client = {
            resumeThread: vi.fn().mockResolvedValue({
                threadId: 'thread-1',
                model: 'gpt-5.4',
            }),
            readThread: vi.fn().mockResolvedValue({
                thread: {
                    id: 'thread-1',
                    title: 'Why the session got stuck',
                },
            }),
        };
        const metadataHandlers: Array<(metadata: any) => any> = [];
        const session = {
            updateMetadata: vi.fn((handler) => metadataHandlers.push(handler)),
            sendSessionEvent: vi.fn(),
        };
        const messageBuffer = {
            addMessage: vi.fn(),
        };

        await resumeExistingThread({
            client,
            session,
            messageBuffer,
            threadId: 'thread-1',
            cwd: '/tmp/project',
            mcpServers: {},
        });

        expect(client.readThread).toHaveBeenCalledWith({
            threadId: 'thread-1',
            includeTurns: true,
        });
        expect(metadataHandlers[0]({ existing: true })).toEqual({
            existing: true,
            codexThreadId: 'thread-1',
            summary: {
                text: 'Why the session got stuck',
                updatedAt: expect.any(Number),
            },
        });
    });

    it('wraps backend resume errors with the thread ID', async () => {
        const client = {
            resumeThread: vi.fn().mockRejectedValue(new Error('thread not found')),
        };
        const session = {
            updateMetadata: vi.fn(),
            sendSessionEvent: vi.fn(),
        };
        const messageBuffer = {
            addMessage: vi.fn(),
        };

        await expect(
            resumeExistingThread({
                client,
                session,
                messageBuffer,
                threadId: 'thread-404',
                cwd: '/tmp/project',
                mcpServers: {},
            }),
        ).rejects.toThrow('Failed to resume Codex thread thread-404: thread not found');
    });
});
