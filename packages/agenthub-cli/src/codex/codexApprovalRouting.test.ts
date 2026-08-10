import { describe, expect, it } from 'vitest';
import {
    classifyCodexApprovalRequest,
    normalizeCodexApprovalRequest,
} from './codexApprovalRouting';

describe('codex approval routing', () => {
    it('classifies legacy and v2 approval methods', () => {
        expect(classifyCodexApprovalRequest('mcpServer/elicitation/request')).toBe('mcp');
        expect(classifyCodexApprovalRequest('item/commandExecution/requestApproval')).toBe('exec');
        expect(classifyCodexApprovalRequest('execCommandApproval')).toBe('exec');
        expect(classifyCodexApprovalRequest('item/fileChange/requestApproval')).toBe('patch');
        expect(classifyCodexApprovalRequest('applyPatchApproval')).toBe('patch');
        expect(classifyCodexApprovalRequest('turn/start')).toBeNull();
    });

    it('normalizes call ids, command payloads and raw patch changes consistently', () => {
        expect(normalizeCodexApprovalRequest('execCommandApproval', { command: 'ls', cwd: '/tmp' }, 7)).toEqual({
            kind: 'exec',
            legacy: true,
            callId: '7',
            command: ['ls'],
            cwd: '/tmp',
        });
        expect(normalizeCodexApprovalRequest('item/fileChange/requestApproval', {
            itemId: 'patch-1',
            reason: 'apply',
        }, 8, new Map([['patch-1', { 'a.txt': { additions: 1 } }]]))).toEqual({
            kind: 'patch',
            legacy: false,
            callId: 'patch-1',
            fileChanges: { 'a.txt': { additions: 1 } },
            reason: 'apply',
        });
    });
});
