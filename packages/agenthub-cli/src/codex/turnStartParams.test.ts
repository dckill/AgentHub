import { describe, expect, it } from 'vitest';

import { buildTurnStartParams } from './turnStartParams.js';

describe('buildTurnStartParams', () => {
    it('builds the minimal request without undefined optional fields', () => {
        expect(buildTurnStartParams('thread-1', 'hello')).toEqual({
            threadId: 'thread-1',
            input: [{ type: 'text', text: 'hello' }],
        });
    });

    it('maps optional turn settings and sandbox modes to app-server params', () => {
        expect(buildTurnStartParams('thread-1', 'hello', {
            clientUserMessageId: 'msg-1',
            cwd: '/tmp/worktree',
            approvalPolicy: 'never',
            model: 'gpt-5-codex',
            effort: 'high',
            sandbox: 'workspace-write',
            extraInputItems: [{ type: 'text', text: 'context' }],
        })).toEqual({
            threadId: 'thread-1',
            input: [
                { type: 'text', text: 'hello' },
                { type: 'text', text: 'context' },
            ],
            clientUserMessageId: 'msg-1',
            cwd: '/tmp/worktree',
            approvalPolicy: 'never',
            model: 'gpt-5-codex',
            effort: 'high',
            sandboxPolicy: { type: 'workspaceWrite' },
        });
    });
});
