import type {
    ApprovalPolicy,
    InputItem,
    ReasoningEffort,
    SandboxMode,
} from './codexAppServerTypes';

export interface TurnStartOptions {
    clientUserMessageId?: string;
    model?: string;
    cwd?: string;
    approvalPolicy?: ApprovalPolicy;
    sandbox?: SandboxMode;
    effort?: ReasoningEffort;
    extraInputItems?: InputItem[];
}

export function buildTurnStartParams(
    threadId: string,
    prompt: string,
    opts?: TurnStartOptions,
): Record<string, unknown> {
    const params: Record<string, unknown> = {
        threadId,
        input: [
            { type: 'text', text: prompt },
            ...(opts?.extraInputItems ?? []),
        ],
    };

    if (opts?.clientUserMessageId) params.clientUserMessageId = opts.clientUserMessageId;
    if (opts?.cwd) params.cwd = opts.cwd;
    if (opts?.approvalPolicy) params.approvalPolicy = opts.approvalPolicy;
    if (opts?.model) params.model = opts.model;
    if (opts?.effort) params.effort = opts.effort;

    if (opts?.sandbox) {
        switch (opts.sandbox) {
            case 'workspace-write':
                params.sandboxPolicy = { type: 'workspaceWrite' };
                break;
            case 'danger-full-access':
                params.sandboxPolicy = { type: 'dangerFullAccess' };
                break;
            case 'read-only':
                params.sandboxPolicy = { type: 'readOnly' };
                break;
        }
    }

    return params;
}
