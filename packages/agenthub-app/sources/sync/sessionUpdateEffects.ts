import { shouldRefreshMessagesForControlHandoff } from './sessionUpdateGuards';

export interface SessionUpdateEffectsInput {
    hasAgentStateUpdate: boolean;
    previousControlledByUser: boolean | null | undefined;
    nextControlledByUser: boolean | null | undefined;
}

export interface SessionUpdateEffects {
    invalidateGitStatus: boolean;
    refreshMessages: boolean;
}

export function buildSessionUpdateEffects(input: SessionUpdateEffectsInput): SessionUpdateEffects {
    return {
        invalidateGitStatus: input.hasAgentStateUpdate,
        refreshMessages: input.hasAgentStateUpdate && shouldRefreshMessagesForControlHandoff({
            previousControlledByUser: input.previousControlledByUser,
            nextControlledByUser: input.nextControlledByUser,
        }),
    };
}
