/** AgentHub-owned structural contract for Claude Code stream-json messages. */

export type PermissionResult =
    | { behavior: 'allow'; updatedInput: Record<string, unknown>; updatedPermissions?: unknown[] }
    | { behavior: 'deny'; message: string; interrupt?: boolean };

export type CanUseTool = (
    toolName: string,
    input: unknown,
    options: {
        signal: AbortSignal;
        toolUseID: string;
        suggestions?: unknown[];
        blockedPath?: string;
        decisionReason?: string;
        title?: string;
        displayName?: string;
        description?: string;
        agentID?: string;
    },
) => Promise<PermissionResult>;

export type CanCallToolCallback = CanUseTool;

export interface SDKContentBlock {
    type: string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    input?: unknown;
    tool_use_id?: string;
    content?: unknown;
    source?: unknown;
    [key: string]: unknown;
}

export interface SDKMessage {
    type: string;
    [key: string]: unknown;
}

export interface SDKUserMessage extends SDKMessage {
    type: 'user';
    parent_tool_use_id: string | null;
    message: { role: 'user'; content: string | SDKContentBlock[]; [key: string]: unknown };
    [key: string]: unknown;
}

export interface SDKAssistantMessage extends SDKMessage {
    type: 'assistant';
    parent_tool_use_id?: string | null;
    message: { role?: 'assistant'; content: SDKContentBlock[]; model?: string; [key: string]: unknown };
    [key: string]: unknown;
}

export interface SDKSystemMessage extends SDKMessage {
    type: 'system';
    subtype: string;
    session_id?: string;
    model?: string;
    cwd?: string;
    tools?: string[];
    slash_commands?: string[];
    mcp_servers?: Array<{ name: string; status: string; [key: string]: unknown }>;
    skills?: string[];
    [key: string]: unknown;
}

export interface SDKResultMessage extends SDKMessage {
    type: 'result';
    subtype: string;
    session_id?: string;
    result?: string;
    is_error?: boolean;
    errors?: string[];
    num_turns: number;
    total_cost_usd: number;
    duration_ms: number;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export class AbortError extends Error {
    constructor(message = 'Claude Code process aborted') {
        super(message);
        this.name = 'AbortError';
    }
}

export interface QueryOptions {
    abort?: AbortSignal;
    allowedTools?: string[];
    appendSystemPrompt?: string;
    customSystemPrompt?: string;
    cwd?: string;
    disallowedTools?: string[];
    maxTurns?: number;
    mcpServers?: Record<string, unknown>;
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto';
    continue?: boolean;
    resume?: string;
    model?: string;
    fallbackModel?: string;
    effort?: 'low' | 'medium' | 'high' | 'max';
    sessionId?: string;
    forkSession?: boolean;
    includePartialMessages?: boolean;
    allowDangerouslySkipPermissions?: boolean;
    settingSources?: string[];
    tools?: string[] | { type: 'preset'; preset: 'claude_code' };
    systemPrompt?: string;
    strictMcpConfig?: boolean;
    canCallTool?: CanCallToolCallback;
    settingsPath?: string;
}

export type QueryPrompt = string | AsyncIterable<SDKMessage>;

export interface Query extends AsyncIterable<SDKMessage> {
    setPermissionMode(mode: string): Promise<void>;
    interrupt(): Promise<void>;
}
