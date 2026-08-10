import { describe, expect, it } from 'vitest';

import { classifyCodexThreadNotification } from './codexThreadNotificationRouting';

describe('codex thread notification routing', () => {
    it('normalizes thread status changes', () => {
        expect(classifyCodexThreadNotification('thread/status/changed', {
            status: { type: 'idle' },
        })).toEqual({
            kind: 'status',
            statusType: 'idle',
        });
    });

    it('prefers top-level thread ids for goal updates', () => {
        const goal = { threadId: 'goal-thread', objective: 'ship it' };
        expect(classifyCodexThreadNotification('thread/goal/updated', {
            threadId: 'thread-1',
            turnId: 'turn-1',
            goal,
        })).toEqual({
            kind: 'goal-updated',
            threadId: 'thread-1',
            turnId: 'turn-1',
            goal,
        });
    });

    it('falls back to goal thread ids and preserves cleared goals', () => {
        const goal = { threadId: 'goal-thread', objective: 'ship it' };
        expect(classifyCodexThreadNotification('thread/goal/updated', { goal })).toEqual({
            kind: 'goal-updated',
            threadId: 'goal-thread',
            turnId: null,
            goal,
        });
        expect(classifyCodexThreadNotification('thread/goal/cleared', {
            threadId: 'thread-1',
        })).toEqual({
            kind: 'goal-cleared',
            threadId: 'thread-1',
        });
    });

    it('normalizes token usage only when the payload is an object', () => {
        expect(classifyCodexThreadNotification('thread/tokenUsage/updated', {
            tokenUsage: { input: 10, output: 4 },
        })).toEqual({
            kind: 'token-usage',
            tokenUsage: { input: 10, output: 4 },
        });
        expect(classifyCodexThreadNotification('thread/tokenUsage/updated', {
            tokenUsage: null,
        })).toEqual({
            kind: 'token-usage',
            tokenUsage: null,
        });
    });

    it('fails closed for unsupported notifications', () => {
        expect(classifyCodexThreadNotification('item/started', { item: {} })).toEqual({ kind: 'ignored' });
    });
});
