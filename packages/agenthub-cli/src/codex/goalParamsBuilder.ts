import type { ThreadGoalClearParams, ThreadGoalSetParams } from './codexAppServerTypes';

export type ThreadGoalSetOptions = {
    threadId: string;
    objective: string;
    status?: ThreadGoalSetParams['status'];
    tokenBudget?: number | null;
};

export function buildThreadGoalSetParams(opts: ThreadGoalSetOptions): ThreadGoalSetParams {
    return {
        threadId: opts.threadId,
        objective: opts.objective,
        ...(opts.status !== undefined ? { status: opts.status } : {}),
        ...(opts.tokenBudget !== undefined ? { tokenBudget: opts.tokenBudget } : {}),
    };
}

export function buildThreadGoalClearParams(opts: Pick<ThreadGoalClearParams, 'threadId'>): ThreadGoalClearParams {
    return { threadId: opts.threadId };
}
