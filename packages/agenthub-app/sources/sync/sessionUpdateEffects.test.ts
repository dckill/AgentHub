import { describe, expect, it } from 'vitest';
import { buildSessionUpdateEffects } from './sessionUpdateEffects';

describe('buildSessionUpdateEffects', () => {
    it('invalidates git status without refreshing messages for unrelated session fields', () => {
        expect(buildSessionUpdateEffects({
            hasAgentStateUpdate: false,
            previousControlledByUser: true,
            nextControlledByUser: false,
        })).toEqual({ invalidateGitStatus: false, refreshMessages: false });
    });

    it('refreshes messages when an agent-state control handoff is observed', () => {
        expect(buildSessionUpdateEffects({
            hasAgentStateUpdate: true,
            previousControlledByUser: true,
            nextControlledByUser: false,
        })).toEqual({ invalidateGitStatus: true, refreshMessages: true });
    });

    it('keeps git invalidation but skips refresh when the handoff state is unknown', () => {
        expect(buildSessionUpdateEffects({
            hasAgentStateUpdate: true,
            previousControlledByUser: undefined,
            nextControlledByUser: false,
        })).toEqual({ invalidateGitStatus: true, refreshMessages: false });
    });
});
