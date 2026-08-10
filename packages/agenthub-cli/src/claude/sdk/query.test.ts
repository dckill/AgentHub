import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildClaudeCliArgs, query, respondToPermissionRequest } from './query';

const originalExecutable = process.env.AGENTHUB_CLAUDE_EXECUTABLE;
const tempDirs: string[] = [];

afterEach(() => {
    if (originalExecutable === undefined) delete process.env.AGENTHUB_CLAUDE_EXECUTABLE;
    else process.env.AGENTHUB_CLAUDE_EXECUTABLE = originalExecutable;
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeClaude(source: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'agenthub-fake-claude-'));
    tempDirs.push(dir);
    const executable = join(dir, 'claude');
    writeFileSync(executable, `#!/usr/bin/env node\n${source}`, { mode: 0o700 });
    chmodSync(executable, 0o700);
    return executable;
}

describe('external Claude CLI query transport', () => {
    it('maps the owned query contract to argv without a shell', () => {
        expect(buildClaudeCliArgs({
            allowedTools: ['Read', 'Bash(git status)'],
            appendSystemPrompt: 'AgentHub prompt',
            continue: true,
            disallowedTools: ['Write'],
            fallbackModel: 'sonnet',
            maxTurns: 4,
            mcpServers: { agenthub: { type: 'http', url: 'http://127.0.0.1:1234' } },
            model: 'opus',
            effort: 'xhigh',
            permissionMode: 'plan',
            settingsPath: '/tmp/settings.json',
            strictMcpConfig: true,
            canCallTool: vi.fn(),
        })).toEqual([
            '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
            '--replay-user-messages', '--permission-prompt-tool', 'stdio',
            '--continue', '--model', 'opus', '--fallback-model', 'sonnet', '--effort', 'xhigh', '--max-turns', '4',
            '--permission-mode', 'plan', '--allowedTools', 'Read,Bash(git status)',
            '--disallowedTools', 'Write', '--mcp-config', JSON.stringify({ mcpServers: { agenthub: { type: 'http', url: 'http://127.0.0.1:1234' } } }),
            '--strict-mcp-config', '--append-system-prompt', 'AgentHub prompt', '--settings', '/tmp/settings.json',
        ]);
    });

    it('converts a permission control request to a correlated response', async () => {
        const canCallTool = vi.fn(async () => ({ behavior: 'allow' as const, updatedInput: { path: 'safe' } }));
        const response = await respondToPermissionRequest({
            type: 'control_request',
            request_id: 'req-1',
            request: { subtype: 'can_use_tool', tool_name: 'Read', input: { path: 'raw' }, tool_use_id: 'tool-1' },
        }, canCallTool);

        expect(canCallTool).toHaveBeenCalledWith('Read', { path: 'raw' }, expect.objectContaining({
            signal: expect.any(AbortSignal),
            toolUseID: 'tool-1',
        }));
        expect(response).toEqual({
            type: 'control_response',
            response: {
                subtype: 'success', request_id: 'req-1',
                response: { behavior: 'allow', updatedInput: { path: 'safe' }, toolUseID: 'tool-1' },
            },
        });
    });

    it('streams messages and permission responses through a separately installed CLI process', async () => {
        process.env.AGENTHUB_CLAUDE_EXECUTABLE = fakeClaude(`
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
rl.on('line', (line) => {
  const value = JSON.parse(line);
  if (value.type === 'control_request' && value.request.subtype === 'set_permission_mode') {
    send({ type: 'control_response', response: { subtype: 'success', request_id: value.request_id, response: {} } });
  } else if (value.type === 'user') {
    send({ type: 'system', subtype: 'init', session_id: 'session-1', tools: ['Read'] });
    send({ type: 'control_request', request_id: 'permission-1', request: { subtype: 'can_use_tool', tool_name: 'Read', input: { path: 'README.md' }, tool_use_id: 'tool-1' } });
  } else if (value.type === 'control_response' && value.response.request_id === 'permission-1') {
    send({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } });
    send({ type: 'result', subtype: 'success', session_id: 'session-1', result: 'done', num_turns: 1, total_cost_usd: 0, duration_ms: 1 });
    process.exit(0);
  }
});`);
        const run = query({
            prompt: 'read it',
            options: { canCallTool: async (_name, input) => ({ behavior: 'allow', updatedInput: input as Record<string, unknown> }) },
        });
        await expect(run.setPermissionMode('plan')).resolves.toBeUndefined();
        const messages = [];
        for await (const message of run) messages.push(message);
        expect(messages.map((message) => message.type)).toEqual(['system', 'assistant', 'result']);
        expect(messages.at(-1)).toMatchObject({ result: 'done', session_id: 'session-1' });
    });

    it('treats an unexpected backend signal as fatal instead of clean EOF', async () => {
        process.env.AGENTHUB_CLAUDE_EXECUTABLE = fakeClaude(`
process.stdin.once('data', () => process.kill(process.pid, 'SIGKILL'));`);
        const run = query({ prompt: 'crash' });
        await expect((async () => {
            for await (const _message of run) { /* drain */ }
        })()).rejects.toThrow(/signal SIGKILL/);
    });
});
