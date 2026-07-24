import { describe, expect, it } from 'vitest';
import {
    countRunningToolsInMessages,
    mergeMessagesNewestFirst,
    selectRetainedSessionMessageIds,
    updateRunningToolCount,
} from './sessionMessageIndex';
import type { Message, ToolCallMessage } from './typesMessage';

type TestMessage = { id: string; createdAt: number; value: string };
const message = (id: string, createdAt: number, value = id): TestMessage => ({ id, createdAt, value });

describe('session message incremental index', () => {
    it('merges inserts and replacements without disturbing newest-first order', () => {
        const existing = [message('new', 30), message('replace', 20, 'old'), message('old', 10)];
        const existingMap = Object.fromEntries(existing.map((value) => [value.id, value]));

        const result = mergeMessagesNewestFirst(existing, existingMap, [
            message('replace', 25, 'updated'),
            message('newest', 40),
            message('oldest', 5),
        ]);

        expect(result.messages.map((value) => value.id)).toEqual(['newest', 'new', 'replace', 'old', 'oldest']);
        expect(result.messagesMap.replace.value).toBe('updated');
    });

    it('handles a 10k history plus a small live batch without duplicates', () => {
        const existing = Array.from({ length: 10_000 }, (_, index) => message(`m-${index}`, 10_000 - index));
        const existingMap = Object.fromEntries(existing.map((value) => [value.id, value]));
        const result = mergeMessagesNewestFirst(existing, existingMap, [
            message('m-5000', 20_000, 'updated'),
            message('live', 20_001),
        ]);

        expect(result.messages).toHaveLength(10_001);
        expect(result.messages.slice(0, 2).map((value) => value.id)).toEqual(['live', 'm-5000']);
        expect(new Set(result.messages.map((value) => value.id)).size).toBe(10_001);
    });

    it('reuses existing projections when updates contain only the same message references', () => {
        const existing = [message('one', 10), message('two', 5)];
        const existingMap = Object.fromEntries(existing.map((value) => [value.id, value]));

        const result = mergeMessagesNewestFirst(existing, existingMap, [existing[0], existing[1]]);

        expect(result.messages).toBe(existing);
        expect(result.messagesMap).toBe(existingMap);
    });

    it('reuses the derived lookup cache instead of copying the full history map', () => {
        const existing = [message('new', 30), message('replace', 20), message('old', 10)];
        const existingMap = Object.fromEntries(existing.map((value) => [value.id, value]));

        const result = mergeMessagesNewestFirst(existing, existingMap, [message('replace', 25, 'updated')]);

        expect(result.messages.map((value) => value.id)).toEqual(['new', 'replace', 'old']);
        expect(result.messagesMap).toBe(existingMap);
        expect(result.messagesMap.replace.value).toBe('updated');
        expect(existing[1].value).toBe('replace');
    });

    it('updates nested running-tool state from only the changed message ids', () => {
        const runningChild: ToolCallMessage = {
            kind: 'tool-call',
            id: 'parent',
            localId: null,
            createdAt: 1,
            tool: {
                name: 'Task',
                state: 'completed',
                input: {},
                createdAt: 1,
                startedAt: 1,
                completedAt: 2,
                description: null,
            },
            children: [{
                kind: 'tool-call',
                id: 'child',
                localId: null,
                createdAt: 2,
                tool: {
                    name: 'Bash',
                    state: 'running',
                    input: {},
                    createdAt: 2,
                    startedAt: 2,
                    completedAt: null,
                    description: null,
                },
                children: [],
            }],
        };
        const completedChild: ToolCallMessage = {
            ...runningChild,
            children: [{
                ...(runningChild.children[0] as ToolCallMessage),
                tool: { ...(runningChild.children[0] as ToolCallMessage).tool, state: 'completed', completedAt: 3 },
            }],
        };
        let lookups = 0;
        const guardedLookup = new Proxy({ parent: runningChild }, {
            get(target, property, receiver) {
                if (typeof property === 'string') lookups += 1;
                return Reflect.get(target, property, receiver);
            },
            ownKeys() {
                throw new Error('full message-map enumeration is forbidden');
            },
        });

        expect(countRunningToolsInMessages([runningChild])).toBe(1);
        expect(updateRunningToolCount(1, guardedLookup, [completedChild])).toBe(0);
        expect(lookups).toBe(1);
    });

    it('coalesces duplicate changed ids before applying the running-tool delta', () => {
        const running = {
            kind: 'tool-call' as const,
            id: 'tool',
            localId: null,
            createdAt: 1,
            tool: {
                name: 'Bash',
                state: 'running' as const,
                input: {},
                createdAt: 1,
                startedAt: 1,
                completedAt: null,
                description: null,
            },
            children: [],
        };
        const completed: Message = {
            ...running,
            tool: { ...running.tool, state: 'completed', completedAt: 2 },
        };

        expect(updateRunningToolCount(0, {}, [running, completed])).toBe(0);
    });

    it('retains all active sessions and only the most recent inactive message states', () => {
        const sessions = Object.fromEntries([
            ['active', { active: true, updatedAt: 1 }],
            ...Array.from({ length: 100 }, (_, index) => [`inactive-${index}`, { active: false, updatedAt: index }] as const),
        ]);
        const loadedIds = ['orphan', ...Object.keys(sessions)];

        const retained = selectRetainedSessionMessageIds(sessions, loadedIds, 20);

        expect(retained.has('active')).toBe(true);
        expect(retained.has('orphan')).toBe(false);
        expect([...retained].filter((id) => id.startsWith('inactive-'))).toHaveLength(20);
        expect(retained.has('inactive-99')).toBe(true);
        expect(retained.has('inactive-0')).toBe(false);
    });
});
