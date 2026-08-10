import { describe, expect, it } from 'vitest';
import {
    createCodexThreadDefaults,
    mergeCodexThreadDefaults,
} from './codexThreadDefaults';

describe('codex thread defaults', () => {
    it('keeps the explicit thread option shape stable', () => {
        expect(createCodexThreadDefaults({
            model: 'gpt-5-codex',
            cwd: '/workspace',
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
            mcpServers: { local: { enabled: true } },
        })).toEqual({
            model: 'gpt-5-codex',
            cwd: '/workspace',
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
            mcpServers: { local: { enabled: true } },
        });
    });

    it('merges resume/fork overrides over the remembered defaults', () => {
        expect(mergeCodexThreadDefaults({
            model: 'gpt-5-codex',
            cwd: '/old',
            approvalPolicy: 'on-request',
            sandbox: 'workspace-write',
            mcpServers: { local: { enabled: true } },
        }, {
            cwd: '/new',
            sandbox: 'read-only',
        })).toEqual({
            model: 'gpt-5-codex',
            cwd: '/new',
            approvalPolicy: 'on-request',
            sandbox: 'read-only',
            mcpServers: { local: { enabled: true } },
        });
    });
});
