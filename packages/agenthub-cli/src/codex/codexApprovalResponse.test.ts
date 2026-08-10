import { describe, expect, it } from 'vitest';
import {
    buildCodexApprovalResponse,
    extractCodexApprovalToolName,
} from './codexApprovalResponse';

describe('Codex approval response planning', () => {
    it('extracts an MCP tool name from a human-readable elicitation message', () => {
        expect(extractCodexApprovalToolName('Approve tool "git" for this turn')).toBe('git');
        expect(extractCodexApprovalToolName('No tool name')).toBeNull();
        expect(extractCodexApprovalToolName(null)).toBeNull();
    });

    it('builds MCP elicitation responses using the request mode', () => {
        expect(buildCodexApprovalResponse(
            { kind: 'mcp', legacy: false, callId: 'mcp:1', input: {}, message: 'tool "git"' },
            'approved',
            { mode: 'form' },
        )).toEqual({ action: 'accept', content: {}, _meta: null });
        expect(buildCodexApprovalResponse(
            { kind: 'mcp', legacy: false, callId: 'mcp:2', input: {} },
            'abort',
            { mode: 'url' },
        )).toEqual({ action: 'cancel', content: null, _meta: null });
    });

    it('builds legacy and v2 command/patch responses from one plan', () => {
        expect(buildCodexApprovalResponse(
            { kind: 'exec', legacy: true, callId: '7', command: ['pwd'] },
            'approved',
        )).toEqual({ decision: 'approved' });
        expect(buildCodexApprovalResponse(
            { kind: 'patch', legacy: false, callId: '8' },
            'denied',
        )).toEqual({ decision: 'decline' });
    });
});
