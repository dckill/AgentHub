import type { ReviewDecision } from './codexAppServerTypes';
import type { CodexRawFileChanges } from './codexRawItemRouting';
import {
    handleCodexServerRequest,
    type CodexApprovalHandlerParams,
} from './codexServerRequestHandler';

export type CodexServerRequestLifecycleParams = {
    id: number;
    method: string;
    params: any;
    rawFileChangesByItemId: Map<string, CodexRawFileChanges>;
    createApprovalResponder: (id: number, cancelResult: unknown) => (result: unknown) => void;
    handleApproval: (params: CodexApprovalHandlerParams) => Promise<ReviewDecision>;
    respondUnknown: (id: number, method: string) => void;
};

/** Keep server-request protocol handling independent from client-owned state and transport. */
export async function handleCodexServerRequestLifecycle(
    params: CodexServerRequestLifecycleParams,
): Promise<void> {
    await handleCodexServerRequest({
        id: params.id,
        method: params.method,
        params: params.params,
        rawFileChangesByItemId: params.rawFileChangesByItemId,
        createApprovalResponder: params.createApprovalResponder,
        handleApproval: params.handleApproval,
        respondUnknown: params.respondUnknown,
    });
}
