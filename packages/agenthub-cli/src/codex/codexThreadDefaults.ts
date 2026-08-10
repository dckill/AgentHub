import type { ApprovalPolicy, SandboxMode } from './codexAppServerTypes';

export interface CodexThreadDefaults {
    model?: string;
    cwd?: string;
    approvalPolicy?: ApprovalPolicy;
    sandbox?: SandboxMode;
    mcpServers?: Record<string, unknown>;
}

export function createCodexThreadDefaults(options: CodexThreadDefaults): CodexThreadDefaults {
    return {
        model: options.model,
        cwd: options.cwd,
        approvalPolicy: options.approvalPolicy,
        sandbox: options.sandbox,
        mcpServers: options.mcpServers,
    };
}

export function mergeCodexThreadDefaults(
    remembered: CodexThreadDefaults,
    overrides: CodexThreadDefaults,
): CodexThreadDefaults {
    return createCodexThreadDefaults({
        model: overrides.model ?? remembered.model,
        cwd: overrides.cwd ?? remembered.cwd,
        approvalPolicy: overrides.approvalPolicy ?? remembered.approvalPolicy,
        sandbox: overrides.sandbox ?? remembered.sandbox,
        mcpServers: overrides.mcpServers ?? remembered.mcpServers,
    });
}
