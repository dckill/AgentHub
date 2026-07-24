import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ensureLocalProxyBypass } from '../utils/proxyBypass';
import {
    AbortError,
    type CanCallToolCallback,
    type Query,
    type QueryOptions,
    type QueryPrompt,
    type SDKMessage,
    type SDKUserMessage,
} from './types';

type PermissionControlRequest = {
    type: 'control_request';
    request_id: string;
    request: {
        subtype: 'can_use_tool';
        tool_name: string;
        input: unknown;
        tool_use_id: string;
        permission_suggestions?: unknown[];
        blocked_path?: string;
        decision_reason?: string;
        title?: string;
        display_name?: string;
        description?: string;
        agent_id?: string;
    };
};

type ControlResponse = {
    type: 'control_response';
    response: { subtype: 'success' | 'error'; request_id: string; response?: unknown; error?: string };
};

export function buildClaudeCliArgs(options: QueryOptions = {}): string[] {
    const args = [
        '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
        '--replay-user-messages',
    ];
    if (options.canCallTool) args.push('--permission-prompt-tool', 'stdio');
    if (options.continue) args.push('--continue');
    if (options.resume) args.push('--resume', options.resume);
    if (options.model) args.push('--model', options.model);
    if (options.fallbackModel) args.push('--fallback-model', options.fallbackModel);
    if (options.effort) args.push('--effort', options.effort);
    if (options.sessionId) args.push('--session-id', options.sessionId);
    if (options.forkSession) args.push('--fork-session');
    if (options.includePartialMessages) args.push('--include-partial-messages');
    if (options.allowDangerouslySkipPermissions) args.push('--allow-dangerously-skip-permissions');
    if (options.settingSources) args.push(`--setting-sources=${options.settingSources.join(',')}`);
    if (options.tools) {
        const tools = Array.isArray(options.tools) ? options.tools.join(',') : 'default';
        args.push('--tools', tools);
    }
    if (options.maxTurns !== undefined) args.push('--max-turns', String(options.maxTurns));
    if (options.permissionMode) args.push('--permission-mode', options.permissionMode);
    if (options.allowedTools?.length) args.push('--allowedTools', options.allowedTools.join(','));
    if (options.disallowedTools?.length) args.push('--disallowedTools', options.disallowedTools.join(','));
    if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
        args.push('--mcp-config', JSON.stringify({ mcpServers: options.mcpServers }));
    }
    if (options.strictMcpConfig) args.push('--strict-mcp-config');
    if (options.systemPrompt) args.push('--system-prompt', options.systemPrompt);
    else if (options.customSystemPrompt) args.push('--system-prompt', options.customSystemPrompt);
    else if (options.appendSystemPrompt) args.push('--append-system-prompt', options.appendSystemPrompt);
    if (options.settingsPath) args.push('--settings', options.settingsPath);
    return args;
}

export async function respondToPermissionRequest(
    message: PermissionControlRequest,
    callback: CanCallToolCallback,
    signal: globalThis.AbortSignal = new AbortController().signal,
): Promise<ControlResponse> {
    const request = message.request;
    try {
        const result = await callback(request.tool_name, request.input, {
            signal,
            toolUseID: request.tool_use_id,
            suggestions: request.permission_suggestions,
            blockedPath: request.blocked_path,
            decisionReason: request.decision_reason,
            title: request.title,
            displayName: request.display_name,
            description: request.description,
            agentID: request.agent_id,
        });
        return {
            type: 'control_response',
            response: {
                subtype: 'success',
                request_id: message.request_id,
                response: { ...result, toolUseID: request.tool_use_id },
            },
        };
    } catch (error) {
        return {
            type: 'control_response',
            response: { subtype: 'error', request_id: message.request_id, error: String(error) },
        };
    }
}

class AsyncMessageQueue implements AsyncIterable<SDKMessage>, AsyncIterator<SDKMessage> {
    private values: SDKMessage[] = [];
    private waiter?: { resolve: (value: IteratorResult<SDKMessage>) => void; reject: (error: unknown) => void };
    private finished = false;
    private failure?: unknown;

    push(value: SDKMessage): void {
        if (this.waiter) {
            const waiter = this.waiter;
            this.waiter = undefined;
            waiter.resolve({ done: false, value });
        } else this.values.push(value);
    }

    end(): void {
        this.finished = true;
        this.waiter?.resolve({ done: true, value: undefined });
        this.waiter = undefined;
    }

    error(error: unknown): void {
        this.failure = error;
        this.waiter?.reject(error);
        this.waiter = undefined;
    }

    next(): Promise<IteratorResult<SDKMessage>> {
        if (this.values.length) return Promise.resolve({ done: false, value: this.values.shift()! });
        if (this.failure) return Promise.reject(this.failure);
        if (this.finished) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolve, reject) => { this.waiter = { resolve, reject }; });
    }

    [Symbol.asyncIterator](): AsyncIterator<SDKMessage> { return this; }
}

class ClaudeCliQuery implements Query {
    private readonly child: ChildProcessWithoutNullStreams;
    private readonly queue = new AsyncMessageQueue();
    private readonly pendingControls = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
    private readonly permissionControllers = new Map<string, AbortController>();
    private aborted = false;
    private stderr = '';

    constructor(private readonly prompt: QueryPrompt, private readonly options: QueryOptions) {
        const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'agenthub-cli' };
        if (options.mcpServers && Object.keys(options.mcpServers).length > 0) ensureLocalProxyBypass(env);
        this.child = spawn(process.env.AGENTHUB_CLAUDE_EXECUTABLE || 'claude', buildClaudeCliArgs(options), {
            cwd: options.cwd,
            env,
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.child.stderr.on('data', (chunk: Buffer) => { this.stderr = (this.stderr + chunk.toString()).slice(-16_384); });
        this.child.on('error', (error) => this.queue.error(error));
        this.child.on('exit', (code, signal) => {
            for (const controller of this.permissionControllers.values()) controller.abort();
            this.permissionControllers.clear();
            if (this.aborted) this.queue.error(new AbortError());
            else if (signal || (code !== null && code !== 0)) {
                this.queue.error(new Error(`Claude Code exited with ${signal ? `signal ${signal}` : `code ${code}`}: ${this.stderr.trim()}`));
            }
            else this.queue.end();
        });
        options.abort?.addEventListener('abort', () => this.abort(), { once: true });
        void this.readOutput();
        void this.writePrompt();
    }

    private writeLine(value: unknown): void {
        if (!this.child.stdin.destroyed && !this.child.stdin.writableEnded) this.child.stdin.write(`${JSON.stringify(value)}\n`);
    }

    private async writePrompt(): Promise<void> {
        try {
            if (typeof this.prompt === 'string') {
                const message: SDKUserMessage = { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: this.prompt } };
                this.writeLine(message);
                if (!this.options.canCallTool) this.child.stdin.end();
                return;
            }
            for await (const message of this.prompt) this.writeLine(message);
            this.child.stdin.end();
        } catch (error) {
            this.queue.error(error);
            this.abort();
        }
    }

    private async readOutput(): Promise<void> {
        const lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
        try {
            for await (const line of lines) {
                if (!line.trim()) continue;
                let message: Record<string, unknown>;
                try { message = JSON.parse(line) as Record<string, unknown>; }
                catch { continue; }
                if (message.type === 'control_request') {
                    const request = message as PermissionControlRequest;
                    if (request.request?.subtype === 'can_use_tool' && this.options.canCallTool) {
                        const controller = new AbortController();
                        this.permissionControllers.set(request.request_id, controller);
                        const response = await respondToPermissionRequest(request, this.options.canCallTool, controller.signal);
                        this.permissionControllers.delete(request.request_id);
                        this.writeLine(response);
                    }
                    continue;
                }
                if (message.type === 'control_cancel_request' && typeof message.request_id === 'string') {
                    this.permissionControllers.get(message.request_id)?.abort();
                    this.permissionControllers.delete(message.request_id);
                    continue;
                }
                if (message.type === 'control_response') {
                    const response = message as unknown as ControlResponse;
                    const pending = this.pendingControls.get(response.response.request_id);
                    if (pending) {
                        this.pendingControls.delete(response.response.request_id);
                        response.response.subtype === 'success' ? pending.resolve() : pending.reject(new Error(response.response.error || 'Claude control request failed'));
                    }
                    continue;
                }
                if (message.type === 'keep_alive') continue;
                this.queue.push(message as unknown as SDKMessage);
                if (message.type === 'result' && typeof this.prompt === 'string' && this.options.canCallTool) this.child.stdin.end();
            }
        } catch (error) {
            this.queue.error(error);
        }
    }

    private abort(): void {
        if (this.aborted) return;
        this.aborted = true;
        this.child.kill('SIGTERM');
    }

    private sendControl(request: Record<string, unknown>): Promise<void> {
        const requestId = randomUUID();
        return new Promise((resolve, reject) => {
            this.pendingControls.set(requestId, { resolve, reject });
            this.writeLine({ type: 'control_request', request_id: requestId, request });
        });
    }

    setPermissionMode(mode: string): Promise<void> {
        return this.sendControl({ subtype: 'set_permission_mode', mode });
    }

    interrupt(): Promise<void> {
        return this.sendControl({ subtype: 'interrupt' });
    }

    [Symbol.asyncIterator](): AsyncIterator<SDKMessage> { return this.queue[Symbol.asyncIterator](); }
}

export function query(params: { prompt: QueryPrompt; options?: QueryOptions }): Query {
    return new ClaudeCliQuery(params.prompt, params.options ?? {});
}
