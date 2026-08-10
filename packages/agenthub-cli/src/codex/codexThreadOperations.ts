import type {
    InjectItemsResponse,
    ReadConversationResponse,
    RollbackConversationResponse,
    ThreadGoalClearResponse,
    ThreadGoalSetResponse,
} from './codexAppServerTypes';
import {
    buildThreadGoalClearParams,
    buildThreadGoalSetParams,
    type ThreadGoalSetOptions,
} from './goalParamsBuilder';

type ThreadRpcRequest = (method: string, params: unknown) => Promise<unknown>;

export async function readCodexThread(options: {
    threadId: string;
    includeTurns?: boolean;
    request: ThreadRpcRequest;
}): Promise<ReadConversationResponse> {
    return await options.request('thread/read', {
        threadId: options.threadId,
        includeTurns: options.includeTurns ?? true,
    }) as ReadConversationResponse;
}

export async function rollbackCodexThread(options: {
    threadId: string;
    numTurns: number;
    request: ThreadRpcRequest;
}): Promise<RollbackConversationResponse> {
    return await options.request('thread/rollback', {
        threadId: options.threadId,
        numTurns: options.numTurns,
    }) as RollbackConversationResponse;
}

export async function injectCodexItems(options: {
    threadId: string;
    items: unknown[];
    request: ThreadRpcRequest;
}): Promise<InjectItemsResponse> {
    return await options.request('thread/inject_items', {
        threadId: options.threadId,
        items: options.items,
    }) as InjectItemsResponse;
}

export async function setCodexThreadGoal(options: ThreadGoalSetOptions & {
    request: ThreadRpcRequest;
}): Promise<ThreadGoalSetResponse> {
    return await options.request('thread/goal/set', buildThreadGoalSetParams(options)) as ThreadGoalSetResponse;
}

export async function clearCodexThreadGoal(options: {
    threadId: string;
    request: ThreadRpcRequest;
}): Promise<ThreadGoalClearResponse> {
    return await options.request(
        'thread/goal/clear',
        buildThreadGoalClearParams(options),
    ) as ThreadGoalClearResponse;
}
