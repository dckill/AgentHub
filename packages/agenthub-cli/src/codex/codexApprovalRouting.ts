export type CodexApprovalKind = 'mcp' | 'exec' | 'patch';

export type CodexApprovalRequest =
    | {
        kind: 'mcp';
        legacy: false;
        callId: string;
        input: unknown;
        serverName?: string;
        message?: string;
    }
    | {
        kind: 'exec';
        legacy: boolean;
        callId: string;
        command: string[];
        cwd?: string;
        reason?: string | null;
    }
    | {
        kind: 'patch';
        legacy: boolean;
        callId: string;
        fileChanges?: Record<string, unknown>;
        reason?: string | null;
    };

export function classifyCodexApprovalRequest(method: string): CodexApprovalKind | null {
    if (method === 'mcpServer/elicitation/request') return 'mcp';
    if (method === 'item/commandExecution/requestApproval' || method === 'execCommandApproval') return 'exec';
    if (method === 'item/fileChange/requestApproval' || method === 'applyPatchApproval') return 'patch';
    return null;
}

export function normalizeCodexApprovalRequest(
    method: string,
    params: any,
    id: number,
    rawFileChangesByItemId?: ReadonlyMap<string, Record<string, unknown>>,
): CodexApprovalRequest | null {
    const kind = classifyCodexApprovalRequest(method);
    if (!kind) return null;

    if (kind === 'mcp') {
        const serverName = typeof params?.serverName === 'string' ? params.serverName : undefined;
        const message = typeof params?.message === 'string' ? params.message : undefined;
        return {
            kind,
            legacy: false,
            callId: `${serverName ?? 'mcp'}:${id}`,
            input: params?._meta?.tool_params ?? {},
            ...(serverName !== undefined ? { serverName } : {}),
            ...(message !== undefined ? { message } : {}),
        };
    }

    const legacy = method === 'execCommandApproval' || method === 'applyPatchApproval';
    const callId = String(params?.itemId ?? params?.callId ?? id);
    if (kind === 'exec') {
        return {
            kind,
            legacy,
            callId,
            command: params?.command != null ? [String(params.command)] : [],
            ...(typeof params?.cwd === 'string' ? { cwd: params.cwd } : {}),
            ...(typeof params?.reason === 'string' || params?.reason === null ? { reason: params.reason } : {}),
        };
    }

    const fileChanges = params?.fileChanges
        ?? rawFileChangesByItemId?.get(callId);
    return {
        kind,
        legacy,
        callId,
        ...(fileChanges !== undefined ? { fileChanges } : {}),
        ...(typeof params?.reason === 'string' || params?.reason === null ? { reason: params.reason } : {}),
    };
}
