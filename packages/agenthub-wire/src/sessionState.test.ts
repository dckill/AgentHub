import { describe, expect, it } from 'vitest';
import { AgentStateSchema, MetadataSchema } from './sessionState';

describe('shared session state contracts', () => {
    it('accepts metadata written by both App and CLI', () => {
        const metadata = MetadataSchema.parse({
            path: '/workspace',
            host: 'laptop',
            homeDir: '/home/user',
            agentHubHomeDir: '/home/user/.agenthub',
            agentHubLibDir: '/home/user/.agenthub/lib',
            agentHubToolsDir: '/home/user/.agenthub/tools',
            sandbox: null,
            dangerouslySkipPermissions: false,
            models: [{ code: 'gpt-5', value: 'GPT-5', supportedReasoningEfforts: [] }],
            mcpServers: [{ name: 'local', status: 'ready' }],
        });

        expect(metadata).toMatchObject({
            path: '/workspace',
            agentHubLibDir: '/home/user/.agenthub/lib',
            agentHubToolsDir: '/home/user/.agenthub/tools',
        });
    });

    it('accepts legacy and current permission fields with nullable timestamps', () => {
        const state = AgentStateSchema.parse({
            requests: {
                'req-1': { tool: 'Bash', arguments: { command: 'ls' }, createdAt: null },
            },
            completedRequests: {
                'req-2': {
                    tool: 'Bash',
                    arguments: { command: 'pwd' },
                    createdAt: null,
                    completedAt: null,
                    status: 'approved',
                    mode: 'safe-yolo',
                    allowTools: ['Bash'],
                    allowedTools: ['Bash'],
                    decision: 'approved',
                },
            },
        });

        expect(state.completedRequests?.['req-2']).toMatchObject({
            allowTools: ['Bash'],
            allowedTools: ['Bash'],
            createdAt: null,
            completedAt: null,
        });
    });
});
