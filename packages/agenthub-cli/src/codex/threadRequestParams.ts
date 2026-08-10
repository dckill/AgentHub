import type {
    ApprovalPolicy,
    ForkConversationParams,
    NewConversationParams,
    ResumeConversationParams,
    SandboxMode,
} from './codexAppServerTypes';

export type ThreadRequestOptions = {
    model?: string;
    cwd?: string;
    approvalPolicy?: ApprovalPolicy;
    sandbox?: SandboxMode;
    mcpServers?: Record<string, unknown>;
};

function buildThreadConfig(mcpServers?: Record<string, unknown>): Record<string, unknown> | null {
    return mcpServers ? { mcp_servers: mcpServers } : null;
}

export function buildStartThreadParams(
    options: ThreadRequestOptions,
    fallbackCwd: string,
): NewConversationParams {
    return {
        model: options.model ?? null,
        modelProvider: null,
        profile: null,
        cwd: options.cwd ?? fallbackCwd,
        approvalPolicy: options.approvalPolicy ?? null,
        sandbox: options.sandbox ?? null,
        config: buildThreadConfig(options.mcpServers),
        baseInstructions: null,
        developerInstructions: null,
        compactPrompt: null,
        includeApplyPatchTool: null,
        experimentalRawEvents: false,
        persistExtendedHistory: true,
    };
}

export function buildResumeThreadParams(
    threadId: string,
    options: ThreadRequestOptions,
    defaults: ThreadRequestOptions,
    fallbackCwd: string,
): ResumeConversationParams {
    return {
        threadId,
        model: options.model ?? defaults.model ?? null,
        modelProvider: null,
        cwd: options.cwd ?? defaults.cwd ?? fallbackCwd,
        approvalPolicy: options.approvalPolicy ?? defaults.approvalPolicy ?? null,
        sandbox: options.sandbox ?? defaults.sandbox ?? null,
        config: buildThreadConfig(options.mcpServers ?? defaults.mcpServers),
        baseInstructions: null,
        developerInstructions: null,
        persistExtendedHistory: true,
    };
}

export function buildForkThreadParams(
    threadId: string,
    options: ThreadRequestOptions,
    defaults: ThreadRequestOptions,
    fallbackCwd: string,
): ForkConversationParams {
    return {
        threadId,
        model: options.model ?? defaults.model ?? null,
        modelProvider: null,
        cwd: options.cwd ?? defaults.cwd ?? fallbackCwd,
        approvalPolicy: options.approvalPolicy ?? defaults.approvalPolicy ?? null,
        sandbox: options.sandbox ?? defaults.sandbox ?? null,
        config: buildThreadConfig(options.mcpServers ?? defaults.mcpServers),
        baseInstructions: null,
        developerInstructions: null,
        ephemeral: false,
        threadSource: null,
    };
}
