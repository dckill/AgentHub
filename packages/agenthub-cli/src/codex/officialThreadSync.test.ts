import { describe, expect, it, vi } from 'vitest';
import { createEnvelope } from '@artsum/agenthub-wire';

import {
    createOfficialCodexThreadSync,
    readOfficialCodexThreadTitle,
} from './officialThreadSync';

describe('createOfficialCodexThreadSync', () => {
    it('records existing history without publishing it, then forwards later side-chat messages', async () => {
        const initialTurn = {
            id: 'turn-existing',
            startedAt: 100,
            completedAt: 101,
            items: [{ type: 'agentMessage', id: 'agent-existing', text: 'existing answer' }],
        };
        const client = {
            readThread: vi.fn()
                .mockResolvedValueOnce({ thread: { id: 'thread-1', turns: [initialTurn] } })
                .mockResolvedValueOnce({ thread: { id: 'thread-1', turns: [initialTurn, {
                    id: 'turn-new',
                    startedAt: 200,
                    completedAt: 201,
                    items: [{ type: 'agentMessage', id: 'agent-new', text: 'new answer' }],
                }] } }),
        };
        const session = {
            sendSessionProtocolMessage: vi.fn(),
            updateMetadata: vi.fn(),
        };
        const sync = createOfficialCodexThreadSync({
            client,
            session,
            threadId: 'thread-1',
            skipInitialHistory: true,
        });

        await sync.poll();
        expect(session.sendSessionProtocolMessage).not.toHaveBeenCalled();

        await sync.poll();
        expect(session.sendSessionProtocolMessage.mock.calls
            .map(([envelope]) => envelope)
            .some((envelope) => envelope.ev.t === 'text' && envelope.ev.text === 'new answer'))
            .toBe(true);
    });

    it('does not republish live text when the official thread uses different envelope and turn ids', async () => {
        const client = {
            readThread: vi.fn().mockResolvedValue({
                thread: {
                    id: 'thread-1',
                    turns: [{
                        id: 'official-turn-1',
                        startedAt: 100,
                        completedAt: 101,
                        items: [
                            { type: 'agentMessage', id: 'official-agent-1', text: 'same answer' },
                        ],
                    }],
                },
            }),
        };
        const session = {
            sendSessionProtocolMessage: vi.fn(),
            updateMetadata: vi.fn(),
        };
        const liveEnvelope = createEnvelope('agent', { t: 'text', text: 'same answer' }, {
            id: 'live-agent-1',
            turn: 'live-turn-1',
            time: 99_000,
        });
        const sync = createOfficialCodexThreadSync({
            client,
            session,
            threadId: 'thread-1',
            seenEnvelopes: [liveEnvelope],
        });

        await sync.poll();

        expect(session.sendSessionProtocolMessage.mock.calls
            .map(([envelope]) => envelope)
            .filter((envelope) => envelope.ev.t === 'text'))
            .toEqual([]);
    });

    it('normalizes boundary whitespace when matching legacy live text to official items', async () => {
        const client = {
            readThread: vi.fn().mockResolvedValue({
                thread: {
                    id: 'thread-1',
                    turns: [{
                        id: 'official-turn-1',
                        startedAt: 100,
                        completedAt: 101,
                        items: [
                            { type: 'agentMessage', id: 'official-agent-1', text: 'same answer' },
                        ],
                    }],
                },
            }),
        };
        const session = {
            sendSessionProtocolMessage: vi.fn(),
            updateMetadata: vi.fn(),
        };
        const sync = createOfficialCodexThreadSync({
            client,
            session,
            threadId: 'thread-1',
            seenEnvelopes: [createEnvelope('agent', { t: 'text', text: '\n same answer \n' }, {
                id: 'legacy-live-agent-1',
                turn: 'legacy-live-turn-1',
            })],
        });

        await sync.poll();

        expect(session.sendSessionProtocolMessage.mock.calls
            .map(([envelope]) => envelope)
            .filter((envelope) => envelope.ev.t === 'text'))
            .toEqual([]);
    });

    it('consumes matching text occurrences one-for-one instead of hiding legitimate repeats', async () => {
        const client = {
            readThread: vi.fn().mockResolvedValue({
                thread: {
                    id: 'thread-1',
                    turns: [{
                        id: 'official-turn-1',
                        startedAt: 100,
                        completedAt: 101,
                        items: [
                            { type: 'agentMessage', id: 'official-agent-1', text: 'repeat' },
                            { type: 'agentMessage', id: 'official-agent-2', text: 'repeat' },
                        ],
                    }],
                },
            }),
        };
        const session = {
            sendSessionProtocolMessage: vi.fn(),
            updateMetadata: vi.fn(),
        };
        const sync = createOfficialCodexThreadSync({
            client,
            session,
            threadId: 'thread-1',
            seenEnvelopes: [createEnvelope('agent', { t: 'text', text: 'repeat' }, { id: 'live-agent-1' })],
        });

        await sync.poll();

        const sentTextIds = session.sendSessionProtocolMessage.mock.calls
            .map(([envelope]) => envelope)
            .filter((envelope) => envelope.ev.t === 'text')
            .map((envelope) => envelope.id);
        expect(sentTextIds).toEqual(['official-agent-2']);
    });

    it('falls back to the latest user message when the official Codex title is just the project name', async () => {
        const client = {
            readThread: vi.fn().mockResolvedValue({
                thread: {
                    id: 'thread-1',
                    cwd: '/home/me/repo',
                    title: 'repo',
                    turns: [
                        {
                            id: 'turn-1',
                            items: [
                                { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'first request' }] },
                            ],
                        },
                        {
                            id: 'turn-2',
                            items: [
                                { type: 'userMessage', id: 'user-2', content: [{ type: 'text', text: 'fix login flow' }] },
                            ],
                        },
                    ],
                },
            }),
        };

        await expect(readOfficialCodexThreadTitle(client, 'thread-1')).resolves.toBe('fix login flow');
        expect(client.readThread).toHaveBeenCalledWith({ threadId: 'thread-1', includeTurns: true });
    });

    it('prefers the official Codex title when it is not the project name', async () => {
        const client = {
            readThread: vi.fn().mockResolvedValue({
                thread: {
                    id: 'thread-1',
                    cwd: '/home/me/repo',
                    title: 'Debug OAuth callback',
                    turns: [
                        {
                            id: 'turn-1',
                            items: [
                                { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'first request' }] },
                            ],
                        },
                    ],
                },
            }),
        };

        await expect(readOfficialCodexThreadTitle(client, 'thread-1')).resolves.toBe('Debug OAuth callback');
    });

    it('backfills only newly discovered Codex thread envelopes', async () => {
        const client = {
            readThread: vi
                .fn()
                .mockResolvedValueOnce({
                    thread: {
                        id: 'thread-1',
                        turns: [{
                            id: 'turn-1',
                            startedAt: 100,
                            completedAt: 101,
                            items: [
                                { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'first' }] },
                            ],
                        }],
                    },
                })
                .mockResolvedValueOnce({
                    thread: {
                        id: 'thread-1',
                        turns: [
                            {
                                id: 'turn-1',
                                startedAt: 100,
                                completedAt: 101,
                                items: [
                                    { type: 'userMessage', id: 'user-1', content: [{ type: 'text', text: 'first' }] },
                                ],
                            },
                            {
                                id: 'turn-2',
                                startedAt: 102,
                                completedAt: 103,
                                items: [
                                    { type: 'agentMessage', id: 'agent-2', text: 'second' },
                                ],
                            },
                        ],
                    },
                }),
        };
        const session = {
            sendSessionProtocolMessage: vi.fn(),
            updateMetadata: vi.fn(),
        };
        const sync = createOfficialCodexThreadSync({
            client,
            session,
            threadId: 'thread-1',
        });

        await sync.poll();
        await sync.poll();

        expect(client.readThread).toHaveBeenCalledTimes(2);
        const sentIds = session.sendSessionProtocolMessage.mock.calls.map(([envelope]) => envelope.id);
        expect(sentIds).toContain('turn-1:start');
        expect(sentIds).toContain('user-1');
        expect(sentIds).toContain('turn-1:end');
        expect(sentIds.filter((id) => id === 'turn-1:start')).toHaveLength(1);
        expect(sentIds).toContain('turn-2:start');
        expect(sentIds).toContain('agent-2');
        expect(sentIds).toContain('turn-2:end');
    });

    it('updates the AgentHub session summary when the official Codex title changes', async () => {
        const client = {
            readThread: vi.fn().mockResolvedValue({
                thread: {
                    id: 'thread-1',
                    title: 'Fresh title',
                    turns: [],
                },
            }),
        };
        const metadataHandlers: Array<(metadata: any) => any> = [];
        const session = {
            sendSessionProtocolMessage: vi.fn(),
            updateMetadata: vi.fn((handler) => metadataHandlers.push(handler)),
        };
        const sync = createOfficialCodexThreadSync({
            client,
            session,
            threadId: 'thread-1',
        });

        await sync.poll();

        expect(metadataHandlers).toHaveLength(1);
        expect(metadataHandlers[0]({ existing: true })).toEqual({
            existing: true,
            codexThreadId: 'thread-1',
            summary: {
                text: 'Fresh title',
                updatedAt: expect.any(Number),
            },
        });
    });

    it('does not close an externally updated turn until Codex marks it complete', async () => {
        const client = {
            readThread: vi
                .fn()
                .mockResolvedValueOnce({
                    thread: {
                        id: 'thread-1',
                        turns: [{
                            id: 'turn-1',
                            startedAt: 100,
                            items: [
                                { type: 'agentMessage', id: 'agent-1', text: 'still working' },
                            ],
                        }],
                    },
                })
                .mockResolvedValueOnce({
                    thread: {
                        id: 'thread-1',
                        turns: [{
                            id: 'turn-1',
                            startedAt: 100,
                            completedAt: 101,
                            status: 'completed',
                            items: [
                                { type: 'agentMessage', id: 'agent-1', text: 'still working' },
                            ],
                        }],
                    },
                }),
        };
        const session = {
            sendSessionProtocolMessage: vi.fn(),
            updateMetadata: vi.fn(),
        };
        const sync = createOfficialCodexThreadSync({
            client,
            session,
            threadId: 'thread-1',
        });

        await sync.poll();

        expect(session.sendSessionProtocolMessage.mock.calls.map(([envelope]) => envelope.ev.t)).toEqual([
            'turn-start',
            'text',
        ]);

        await sync.poll();

        expect(session.sendSessionProtocolMessage.mock.calls.map(([envelope]) => envelope.ev.t)).toEqual([
            'turn-start',
            'text',
            'turn-end',
        ]);
    });
});
