import { describe, expect, it, vi } from 'vitest';
import { createIncrementalMessageGrouper, formatAgentWorkSummaryLabel, getAgentWorkSummary, groupMessagesForDisplay, groupToolCallsForDisplay } from './useGroupedMessages';
import { Message, ToolCallMessage } from '@/sync/typesMessage';
import { createReducer, reducer } from '@/sync/reducer/reducer';
import { normalizeRawMessage, type NormalizedMessage } from '@/sync/typesRaw';
import { resolveCollapsedGroupIds, type GroupCollapseOverrides } from '@/components/groupCollapseState';

vi.mock('@/components/tools/knownTools', () => ({
    knownTools: {
        Skill: { hidden: true },
    },
}));

vi.mock('@/text', () => ({
    t: (key: string, params?: { count?: number; duration?: string }) => `${key}:${params?.count ?? params?.duration ?? ''}`,
}));

function toolMessage(id: string, createdAt: number, options: { pendingPermission?: boolean } = {}): ToolCallMessage {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt,
        tool: {
            name: 'CodexBash',
            state: 'completed',
            input: { command: id },
            createdAt,
            startedAt: createdAt,
            completedAt: createdAt + 1,
            description: id,
            ...(options.pendingPermission
                ? {
                    permission: {
                        id: `permission-${id}`,
                        status: 'pending' as const,
                    },
                }
                : {}),
        },
        children: [],
    };
}

function namedToolMessage(id: string, name: string, createdAt: number): ToolCallMessage {
    const message = toolMessage(id, createdAt);
    return {
        ...message,
        tool: {
            ...message.tool,
            name,
        },
    };
}

function agentText(id: string, createdAt: number, text: string): Message {
    return { kind: 'agent-text', id, localId: null, createdAt, text };
}

function completedTurn(finalTextId: string, createdAt: number, status: 'completed' | 'failed' | 'cancelled' = 'completed'): Message {
    return {
        kind: 'agent-event',
        id: `turn-end-${finalTextId}`,
        createdAt,
        event: { type: 'ready' },
        meta: { turnStatus: status, ...(status === 'completed' ? { finalTextId } : {}) },
    };
}

describe('useGroupedMessages', () => {
    it('preserves completed turn provenance across normalization, reducer projection, and grouping', () => {
        const sessionRecord = (data: Record<string, unknown>) => ({
            role: 'session' as const,
            content: { type: 'session' as const, data },
        });
        const normalized = [
            normalizeRawMessage('db-final', null, 3, sessionRecord({
                id: 'source-final', time: 3, role: 'agent', turn: 'turn-1',
                ev: { t: 'text', text: 'Final answer' },
            }) as any),
            normalizeRawMessage('db-progress', null, 2, sessionRecord({
                id: 'source-progress', time: 2, role: 'agent', turn: 'turn-1',
                ev: { t: 'text', text: 'Checking files' },
            }) as any),
            normalizeRawMessage('db-ready', null, 4, sessionRecord({
                id: 'source-ready', time: 4, role: 'agent', turn: 'turn-1',
                ev: { t: 'turn-end', status: 'completed', finalTextId: 'source-final' },
            }) as any),
        ].filter((message): message is NormalizedMessage => message !== null);

        const result = reducer(createReducer(), normalized);
        const finalMessage = result.messages.find((message) => message.kind === 'agent-text' && message.text === 'Final answer');
        const readyMessage = result.messages.find((message) => message.kind === 'agent-event' && message.event.type === 'ready');

        expect(finalMessage).toBeTruthy();
        expect(finalMessage?.id).not.toBe('source-final');
        expect(readyMessage?.meta).toMatchObject({
            turnStatus: 'completed',
            finalTextId: finalMessage?.id,
        });

        const display = groupMessagesForDisplay(
            [...result.messages].sort((left, right) => right.createdAt - left.createdAt),
            true,
        );
        expect(display.map((item) => item.type)).toEqual(['message', 'agent-work-group']);
        expect(display[0]).toMatchObject({ type: 'message', id: finalMessage?.id });
    });

    it('reuses unchanged older turn display items when only the current turn changes', () => {
        const grouper = createIncrementalMessageGrouper();
        const olderUser: Message = { kind: 'user-text', id: 'user-old', localId: null, createdAt: 1, text: 'old' };
        const currentUser: Message = { kind: 'user-text', id: 'user-current', localId: null, createdAt: 10, text: 'current' };
        const olderTool = toolMessage('older-tool', 2);
        const first = grouper.group([
            toolMessage('current-tool', 11),
            currentUser,
            olderTool,
            olderUser,
        ]);
        const olderItem = first.find((item) => item.id === olderTool.id);

        const second = grouper.group([
            { kind: 'agent-text', id: 'current-answer', localId: null, createdAt: 12, text: 'done' },
            toolMessage('current-tool', 11),
            currentUser,
            olderTool,
            olderUser,
        ]);

        expect(second.find((item) => item.id === olderTool.id)).toBe(olderItem);
    });

    it('reprojects an unchanged current turn when it becomes eligible for collapsing', () => {
        const grouper = createIncrementalMessageGrouper();
        const messages: Message[] = [
            completedTurn('agent-final', 5),
            agentText('agent-final', 4, 'done'),
            toolMessage('tool', 2),
            { kind: 'user-text', id: 'user', localId: null, createdAt: 1, text: 'work' },
        ];

        expect(grouper.group(messages, true, { collapseCurrentTurn: false }).map((item) => item.type))
            .toEqual(['message', 'message', 'message']);
        expect(grouper.group(messages, true, { collapseCurrentTurn: true }).map((item) => item.type))
            .toEqual(['message', 'agent-work-group', 'message']);
    });

    it('reuses older display projections in a 10k-message history', () => {
        const grouper = createIncrementalMessageGrouper();
        const messages: Message[] = [];
        for (let index = 5_000; index > 0; index -= 1) {
            messages.push(toolMessage(`tool-${index}`, index * 2));
            messages.push({
                kind: 'user-text',
                id: `user-${index}`,
                localId: null,
                createdAt: index * 2 - 1,
                text: `turn ${index}`,
            });
        }
        const first = grouper.group(messages);
        const firstItems = new Set(first);
        const second = grouper.group([
            { kind: 'agent-text', id: 'live', localId: null, createdAt: 20_000, text: 'live' },
            ...messages,
        ]);

        expect(first).toHaveLength(10_000);
        expect(second.filter((item) => firstItems.has(item))).toHaveLength(9_998);
    });
    it('stores grouped tools in chronological render order', () => {
        const messages: Message[] = [
            completedTurn('agent-final', 6),
            {
                kind: 'agent-text',
                id: 'agent-after-tools',
                localId: null,
                createdAt: 5,
                text: 'done',
            },
            toolMessage('tool-latest', 4),
            toolMessage('tool-middle', 3),
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const group = groupToolCallsForDisplay(messages, true).find((item) => item.type === 'tool-group');

        expect(group?.messages.map((message) => message.id)).toEqual([
            'tool-earliest',
            'tool-middle',
            'tool-latest',
        ]);
    });

    it('groups only adjacent tool calls between text messages', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 7,
                text: 'done',
            },
            toolMessage('tool-4', 6),
            toolMessage('tool-3', 5),
            {
                kind: 'agent-text',
                id: 'agent-middle',
                localId: null,
                createdAt: 4,
                text: 'next step',
            },
            toolMessage('tool-2', 3),
            toolMessage('tool-1', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const groups = groupToolCallsForDisplay(messages, true).filter((item) => item.type === 'tool-group');

        expect(groups).toHaveLength(2);
        expect(groups[0]?.messages.map((message) => message.id)).toEqual(['tool-3', 'tool-4']);
        expect(groups[1]?.messages.map((message) => message.id)).toEqual(['tool-1', 'tool-2']);
    });

    it('keeps the final agent message visible and collapses earlier agent work', () => {
        const messages: Message[] = [
            completedTurn('agent-final', 6),
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 5,
                text: 'done',
            },
            toolMessage('tool-latest', 4),
            {
                kind: 'agent-text',
                id: 'agent-progress',
                localId: null,
                createdAt: 3,
                text: 'checking',
            },
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const items = groupMessagesForDisplay(messages, true);

        expect(items.map((item) => item.type)).toEqual(['message', 'agent-work-group', 'message']);
        expect(items[0]).toMatchObject({ type: 'message', id: 'agent-final' });
        expect(items[1]).toMatchObject({ type: 'agent-work-group', id: 'work-turn-end-agent-final' });
        if (items[1].type !== 'agent-work-group') {
            throw new Error('Expected an agent work group');
        }
        expect(items[1].messages.map((message) => message.id)).toEqual([
            'tool-latest',
            'agent-progress',
            'tool-earliest',
        ]);
    });

    it('keeps agent work and nested tool group ids stable when older pages extend the turn', () => {
        const initial: Message[] = [
            completedTurn('agent-final', 6),
            agentText('agent-final', 5, 'done'),
            toolMessage('tool-newest', 4),
            toolMessage('tool-middle', 3),
            { kind: 'user-text', id: 'user', localId: null, createdAt: 1, text: 'work' },
        ];
        const extended: Message[] = [
            ...initial.slice(0, -1),
            toolMessage('tool-older', 2),
            initial.at(-1)!,
        ];

        const initialWork = groupMessagesForDisplay(initial, true).find((item) => item.type === 'agent-work-group');
        const extendedWork = groupMessagesForDisplay(extended, true).find((item) => item.type === 'agent-work-group');
        expect(initialWork?.id).toBe(extendedWork?.id);

        const overrides: GroupCollapseOverrides = {
            sessionId: 'session-1',
            values: new Map([[initialWork!.id, false]]),
        };
        expect(resolveCollapsedGroupIds([extendedWork!], overrides, 'session-1').size).toBe(0);

        const initialNested = groupToolCallsForDisplay(initialWork!.messages, true).find((item) => item.type === 'tool-group');
        const extendedNested = groupToolCallsForDisplay(extendedWork!.messages, true).find((item) => item.type === 'tool-group');
        expect(initialNested?.id).toBe(extendedNested?.id);
    });

    it('does not collapse the current turn while the agent is still working', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-streaming',
                localId: null,
                createdAt: 5,
                text: 'still working',
            },
            toolMessage('tool-latest', 4),
            {
                kind: 'agent-text',
                id: 'agent-progress',
                localId: null,
                createdAt: 3,
                text: 'checking',
            },
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const items = groupMessagesForDisplay(messages, true, { collapseCurrentTurn: false });

        expect(items.map((item) => item.type)).toEqual([
            'message',
            'message',
            'message',
            'message',
            'message',
        ]);
        expect(items.map((item) => item.id)).toEqual([
            'agent-streaming',
            'tool-latest',
            'agent-progress',
            'tool-earliest',
            'user',
        ]);
    });

    it('does not collapse a cancelled turn that only has partial agent text', () => {
        const messages: Message[] = [
            completedTurn('partial', 6, 'cancelled'),
            agentText('partial', 5, 'partial progress'),
            toolMessage('tool-latest', 4),
            toolMessage('tool-earliest', 2),
            { kind: 'user-text', id: 'user', localId: null, createdAt: 1, text: 'work' },
        ];

        expect(groupMessagesForDisplay(messages, true).some((item) => item.type === 'agent-work-group')).toBe(false);
    });

    it('keeps adjacent current-turn tools individually visible while the agent is still working', () => {
        const messages: Message[] = [
            toolMessage('tool-latest', 4),
            toolMessage('tool-earliest', 3),
            { kind: 'user-text', id: 'user', localId: null, createdAt: 1, text: 'run tools' },
        ];

        const items = groupMessagesForDisplay(messages, true, { collapseCurrentTurn: false });

        expect(items.map((item) => item.type)).toEqual(['message', 'message', 'message']);
    });

    it('still groups adjacent tools in completed historical turns', () => {
        const messages: Message[] = [
            toolMessage('current-tool', 8),
            { kind: 'user-text', id: 'current-user', localId: null, createdAt: 7, text: 'current' },
            toolMessage('tool-latest', 5),
            toolMessage('tool-earliest', 4),
            {
                kind: 'user-text',
                id: 'older-user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const items = groupMessagesForDisplay(messages, true, { collapseCurrentTurn: false });

        expect(items.map((item) => item.type)).toEqual(['message', 'message', 'tool-group', 'message']);
        expect(items[2]).toMatchObject({
            type: 'tool-group',
            id: 'group-tool-latest',
            hasPendingPermission: false,
        });
    });

    it('marks a tool group when it contains a pending permission', () => {
        const messages: Message[] = [
            toolMessage('tool-latest', 3, { pendingPermission: true }),
            toolMessage('tool-earliest', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run tools',
            },
        ];

        const group = groupMessagesForDisplay(messages, true).find((item) => item.type === 'tool-group');

        expect(group).toMatchObject({
            type: 'tool-group',
            id: 'group-tool-latest',
            hasPendingPermission: true,
        });
    });

    it('keeps a running AskUserQuestion outside completed agent work', () => {
        const ask = namedToolMessage('ask-user', 'AskUserQuestion', 4);
        ask.tool.state = 'running';
        const messages: Message[] = [
            completedTurn('agent-final', 6),
            agentText('agent-final', 5, 'I need one answer.'),
            ask,
            toolMessage('tool-earliest', 2),
            { kind: 'user-text', id: 'user', localId: null, createdAt: 1, text: 'help me' },
        ];

        const items = groupMessagesForDisplay(messages, true);

        expect(items.find((item) => item.id === 'ask-user')).toMatchObject({ type: 'message' });
        const workGroup = items.find((item) => item.type === 'agent-work-group');
        expect(workGroup?.messages.map((message) => message.id)).not.toContain('ask-user');
    });

    it('summarizes tool count, unique edited files, failures, and duration', () => {
        const editA = namedToolMessage('edit-a', 'CodexPatch', 1);
        editA.tool.input = { changes: { '/repo/a.ts': {}, '/repo/b.ts': {} } };
        const editAAgain = namedToolMessage('edit-a-again', 'Edit', 2);
        editAAgain.tool.input = { file_path: '/repo/a.ts' };
        const editB = namedToolMessage('edit-b', 'Write', 3);
        editB.tool.input = { path: '/repo/b.ts' };
        const notebook = namedToolMessage('notebook', 'NotebookEdit', 4);
        notebook.tool.input = { notebook_path: '/repo/a.ts' };
        const failed = namedToolMessage('failed', 'CodexBash', 5);
        failed.tool.state = 'error';

        expect(getAgentWorkSummary([editA, editAAgain, editB, notebook, failed], 1_000, 6_000)).toEqual({
            toolCount: 5,
            editedFileCount: 2,
            errorCount: 1,
            durationMs: 5_000,
        });
    });

    it('formats work summaries through existing plural-aware labels', () => {
        expect(formatAgentWorkSummaryLabel({
            toolCount: 1,
            editedFileCount: 2,
            errorCount: 1,
            durationMs: 1_000,
        }, '1s')).toBe('toolGroup.usedTools:1 · toolGroup.editedFiles:2 · toolGroup.errors:1 · toolGroup.workedFor:1s');
    });

    it('does not collapse a single standalone tool call into a tool group', () => {
        const messages: Message[] = [
            toolMessage('tool-only', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run one tool',
            },
        ];

        const items = groupMessagesForDisplay(messages, true);

        expect(items.map((item) => item.type)).toEqual(['message', 'message']);
        expect(items[0]).toMatchObject({ type: 'message', id: 'tool-only' });
    });

    it('hides Claude Skill tool calls from the display list', () => {
        const messages: Message[] = [
            {
                kind: 'agent-text',
                id: 'agent-final',
                localId: null,
                createdAt: 3,
                text: 'done',
            },
            namedToolMessage('skill-tool', 'Skill', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run skill',
            },
        ];

        const items = groupMessagesForDisplay(messages, true);

        expect(items.map((item) => item.id)).toEqual(['agent-final', 'user']);
    });

    it('can collapse single standalone tool calls for nested work details', () => {
        const messages: Message[] = [
            toolMessage('tool-only', 2),
            {
                kind: 'user-text',
                id: 'user',
                localId: null,
                createdAt: 1,
                text: 'run one tool',
            },
        ];

        const items = groupToolCallsForDisplay(messages, true, { groupSingleToolCalls: true });

        expect(items.map((item) => item.type)).toEqual(['tool-group', 'message']);
        expect(items[0]).toMatchObject({
            type: 'tool-group',
            id: 'group-tool-only',
            hasPendingPermission: false,
        });
        if (items[0].type !== 'tool-group') {
            throw new Error('Expected a tool group');
        }
        expect(items[0].messages.map((message) => message.id)).toEqual(['tool-only']);
    });
});
