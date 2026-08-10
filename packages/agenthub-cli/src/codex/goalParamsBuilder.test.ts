import { describe, expect, it } from 'vitest';

import { buildThreadGoalClearParams, buildThreadGoalSetParams } from './goalParamsBuilder';

describe('goalParamsBuilder', () => {
    it('preserves optional goal fields only when explicitly provided', () => {
        expect(buildThreadGoalSetParams({
            threadId: 'thread-1',
            objective: 'Ship the fix',
            status: 'active',
            tokenBudget: null,
        })).toEqual({
            threadId: 'thread-1',
            objective: 'Ship the fix',
            status: 'active',
            tokenBudget: null,
        });

        expect(buildThreadGoalSetParams({ threadId: 'thread-2', objective: 'Review the diff' })).toEqual({
            threadId: 'thread-2',
            objective: 'Review the diff',
        });
    });

    it('builds the clear request with only its thread id', () => {
        expect(buildThreadGoalClearParams({ threadId: 'thread-3' })).toEqual({ threadId: 'thread-3' });
    });
});
