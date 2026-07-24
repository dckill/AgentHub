import { describe, expect, it } from 'vitest';
import { getLifecycleThinkingStateFromRawContent, inferThinkingFromMessages, resolveActivityThinkingState, resolveSessionThinkingState } from './sessionActivity';
import type { Message } from '@/sync/typesMessage';

describe('sessionActivity', () => {
    it('detects lifecycle start and end events from raw session content', () => {
        expect(getLifecycleThinkingStateFromRawContent({
            content: { type: 'session', data: { ev: { t: 'turn-start' } } },
        })).toBe(true);

        expect(getLifecycleThinkingStateFromRawContent({
            content: { type: 'codex', data: { type: 'task_started' } },
        })).toBe(true);

        expect(getLifecycleThinkingStateFromRawContent({
            content: { type: 'session', data: { ev: { t: 'turn-end' } } },
        })).toBe(false);

        expect(getLifecycleThinkingStateFromRawContent({
            content: { type: 'acp', data: { type: 'turn_aborted' } },
        })).toBe(false);
    });

    it('infers thinking when any visible or nested tool is running', () => {
        const messages: Message[] = [{
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
                    input: { command: 'npm test' },
                    createdAt: 2,
                    startedAt: 2,
                    completedAt: null,
                    description: null,
                },
                children: [],
            }],
        }];

        expect(inferThinkingFromMessages(messages)).toBe(true);
    });

    it('restores thinking from server state when local state is empty', () => {
        expect(resolveSessionThinkingState(null, {
            active: true,
            activeAt: 2000,
            thinking: true,
            thinkingAt: 1500,
        })).toEqual({ thinking: true, thinkingAt: 1500 });
    });

    it('keeps newer local thinking state over stale session fetches', () => {
        expect(resolveSessionThinkingState(
            { thinking: true, thinkingAt: 3000 },
            { active: true, activeAt: 2000, thinking: false, thinkingAt: 1000 },
        )).toEqual({ thinking: true, thinkingAt: 3000 });
    });

    it('clears local thinking when server has a newer completed state', () => {
        expect(resolveSessionThinkingState(
            { thinking: true, thinkingAt: 1000 },
            { active: true, activeAt: 3000, thinking: false, thinkingAt: 3000 },
        )).toEqual({ thinking: false, thinkingAt: 3000 });
    });

    it('does not show inactive sessions as thinking even if the server value is stale', () => {
        expect(resolveSessionThinkingState(null, {
            active: false,
            activeAt: 4000,
            thinking: true,
            thinkingAt: 3500,
        })).toEqual({ thinking: false, thinkingAt: 3500 });
    });

    it('lets an inactive server state clear newer local thinking', () => {
        expect(resolveSessionThinkingState(
            { active: true, thinking: true, thinkingAt: 5000 },
            { active: false, activeAt: 6000, thinking: false, thinkingAt: null },
        )).toEqual({ thinking: false, thinkingAt: 6000 });
    });

    it('keeps an active turn ongoing when keep-alive reports idle activity', () => {
        expect(resolveActivityThinkingState(
            { active: true, thinking: true, thinkingAt: 1000 },
            { active: true, activeAt: 2000, thinking: false },
        )).toEqual({ thinking: true, thinkingAt: 1000 });
    });

    it('lets activity start or inactive activity clear ongoing state', () => {
        expect(resolveActivityThinkingState(
            { active: true, thinking: false, thinkingAt: 0 },
            { active: true, activeAt: 2000, thinking: true },
        )).toEqual({ thinking: true, thinkingAt: 2000 });

        expect(resolveActivityThinkingState(
            { active: true, thinking: true, thinkingAt: 1000 },
            { active: false, activeAt: 3000, thinking: false },
        )).toEqual({ thinking: false, thinkingAt: 3000 });
    });
});
