import { apiSocket } from './apiSocket';
import type {
    RpcListOfficialThreadsRequest,
    RpcListOfficialThreadsResult,
    RpcOfficialThread,
    RpcOfficialThreadState,
} from '@artsum/agenthub-wire';

export type OfficialCodexThread = RpcOfficialThread;
export type ListOfficialCodexThreadsOptions = RpcListOfficialThreadsRequest;
export type OfficialCodexThreadState = RpcOfficialThreadState;

interface ListIgnoredOfficialCodexThreadsResult {
    type: 'success';
    threadIds: string[];
}

export async function listOfficialCodexThreads(machineId: string, options: ListOfficialCodexThreadsOptions = {}): Promise<OfficialCodexThread[]> {
    const result = await apiSocket.machineRPC<RpcListOfficialThreadsResult, ListOfficialCodexThreadsOptions>(
        machineId,
        'codex-list-official-threads',
        options,
    );

    return Array.isArray(result.threads) ? result.threads : [];
}

export async function listOfficialCodexThreadStates(machineId: string, threadIds: string[]): Promise<OfficialCodexThreadState[]> {
    const result = await apiSocket.machineRPC<{ type: 'success'; threadStates: OfficialCodexThreadState[] }, { threadIds: string[] }>(
        machineId,
        'codex-list-official-thread-states',
        { threadIds },
    );

    return Array.isArray(result.threadStates) ? result.threadStates : [];
}

export async function listIgnoredOfficialCodexThreads(machineId: string): Promise<string[]> {
    const result = await apiSocket.machineRPC<ListIgnoredOfficialCodexThreadsResult, Record<string, never>>(
        machineId,
        'codex-list-ignored-official-threads',
        {},
    );

    return Array.isArray(result.threadIds) ? result.threadIds : [];
}

export async function ignoreOfficialCodexThread(machineId: string, threadId: string): Promise<void> {
    await apiSocket.machineRPC<{ type: 'success' }, { threadId: string }>(
        machineId,
        'codex-ignore-official-thread',
        { threadId },
    );
}

export async function unignoreOfficialCodexThread(machineId: string, threadId: string): Promise<void> {
    await apiSocket.machineRPC<{ type: 'success' }, { threadId: string }>(
        machineId,
        'codex-unignore-official-thread',
        { threadId },
    );
}
