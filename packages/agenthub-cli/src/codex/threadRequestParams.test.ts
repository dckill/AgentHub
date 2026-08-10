import { describe, expect, it } from 'vitest';

import {
    buildForkThreadParams,
    buildResumeThreadParams,
    buildStartThreadParams,
} from './threadRequestParams';

const defaults = {
    model: 'gpt-default',
    cwd: '/workspace/default',
    approvalPolicy: 'on-request' as const,
    sandbox: 'workspace-write' as const,
    mcpServers: { docs: { url: 'https://docs.example' } },
};

describe('Codex thread request params', () => {
    it('builds a start request with explicit null protocol defaults', () => {
        expect(buildStartThreadParams({ model: 'gpt-test', cwd: '/tmp/project' }, '/fallback')).toEqual({
            model: 'gpt-test',
            modelProvider: null,
            profile: null,
            cwd: '/tmp/project',
            approvalPolicy: null,
            sandbox: null,
            config: null,
            baseInstructions: null,
            developerInstructions: null,
            compactPrompt: null,
            includeApplyPatchTool: null,
            experimentalRawEvents: false,
            persistExtendedHistory: true,
        });
    });

    it('lets resume options override remembered defaults while preserving omitted values', () => {
        expect(buildResumeThreadParams('thread-1', {
            model: 'gpt-override',
            mcpServers: { local: { command: 'docs' } },
        }, defaults, '/fallback')).toEqual({
            threadId: 'thread-1',
            model: 'gpt-override',
            modelProvider: null,
            cwd: '/workspace/default',
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
            config: { mcp_servers: { local: { command: 'docs' } } },
            baseInstructions: null,
            developerInstructions: null,
            persistExtendedHistory: true,
        });
    });

    it('keeps fork requests non-ephemeral and inherits the thread defaults', () => {
        expect(buildForkThreadParams('thread-source', {}, defaults, '/fallback')).toEqual({
            threadId: 'thread-source',
            model: 'gpt-default',
            modelProvider: null,
            cwd: '/workspace/default',
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
            config: { mcp_servers: defaults.mcpServers },
            baseInstructions: null,
            developerInstructions: null,
            ephemeral: false,
            threadSource: null,
        });
    });
});
