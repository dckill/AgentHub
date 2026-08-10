import type { ReviewDecision } from './codexAppServerTypes';
import {
    buildCodexApprovalResponse,
    extractCodexApprovalToolName,
} from './codexApprovalResponse';
import {
    normalizeCodexApprovalRequest,
    type CodexApprovalRequest,
} from './codexApprovalRouting';

export interface CodexApprovalHandlerParams {
    type: 'exec' | 'patch' | 'mcp';
    callId: string;
    command?: string[];
    cwd?: string;
    fileChanges?: Record<string, unknown>;
    reason?: string | null;
    toolName?: string;
    input?: unknown;
    serverName?: string;
    message?: string;
}

export interface CodexServerRequestHandlerOptions {
    id: number;
    method: string;
    params: any;
    rawFileChangesByItemId?: ReadonlyMap<string, Record<string, unknown>>;
    createApprovalResponder: (id: number, cancelResult: unknown) => (result: unknown) => void;
    handleApproval: (params: CodexApprovalHandlerParams) => Promise<ReviewDecision>;
    respondUnknown: (id: number, method: string) => void;
}

export async function handleCodexServerRequest(options: CodexServerRequestHandlerOptions): Promise<void> {
    const approval = normalizeCodexApprovalRequest(
        options.method,
        options.params,
        options.id,
        options.rawFileChangesByItemId,
    );

    if (approval?.kind === 'mcp') {
        const toolName = extractCodexApprovalToolName(approval.message) ?? approval.serverName ?? 'McpTool';
        const respondOnce = options.createApprovalResponder(
            options.id,
            buildCodexApprovalResponse(approval, 'abort', options.params),
        );
        const decision = await options.handleApproval({
            type: 'mcp',
            callId: approval.callId,
            toolName,
            input: approval.input,
            serverName: approval.serverName,
            message: approval.message,
        });
        respondOnce(buildCodexApprovalResponse(approval, decision, options.params));
        return;
    }

    if (approval?.kind === 'exec') {
        const respondOnce = options.createApprovalResponder(
            options.id,
            buildCodexApprovalResponse(approval, 'abort'),
        );
        const decision = await options.handleApproval({
            type: 'exec',
            callId: approval.callId,
            command: approval.command,
            cwd: approval.cwd,
            reason: approval.reason,
        });
        respondOnce(buildCodexApprovalResponse(approval, decision));
        return;
    }

    if (approval?.kind === 'patch') {
        const respondOnce = options.createApprovalResponder(
            options.id,
            buildCodexApprovalResponse(approval, 'abort'),
        );
        const decision = await options.handleApproval({
            type: 'patch',
            callId: approval.callId,
            fileChanges: approval.fileChanges,
            reason: approval.reason,
        });
        respondOnce(buildCodexApprovalResponse(approval, decision));
        return;
    }

    options.respondUnknown(options.id, options.method);
}

export type { CodexApprovalRequest };
