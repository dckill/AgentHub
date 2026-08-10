import { describe, expect, it } from 'vitest';
import type { ReviewDecision } from './codexAppServerTypes';
import { handleCodexServerRequest, type CodexApprovalHandlerParams } from './codexServerRequestHandler';

function createHarness(decision: ReviewDecision = 'approved') {
    const approvals: CodexApprovalHandlerParams[] = [];
    const responses: Array<{ id: number; result: unknown }> = [];
    const unknown: Array<{ id: number; method: string }> = [];

    return {
        approvals,
        responses,
        unknown,
        options: {
            rawFileChangesByItemId: new Map<string, Record<string, unknown>>(),
            createApprovalResponder: (id: number, cancelResult: unknown) => {
                let settled = false;
                return (result: unknown) => {
                    if (settled) return;
                    settled = true;
                    responses.push({ id, result: result ?? cancelResult });
                };
            },
            handleApproval: async (params: CodexApprovalHandlerParams) => {
                approvals.push(params);
                return decision;
            },
            respondUnknown: (id: number, method: string) => unknown.push({ id, method }),
        },
    };
}

describe('codex server request handler', () => {
    it('routes MCP approvals with tool metadata and a response', async () => {
        const harness = createHarness('denied');

        await handleCodexServerRequest({
            ...harness.options,
            id: 7,
            method: 'mcpServer/elicitation/request',
            params: { serverName: 'local', message: 'approve?', _meta: { tool_params: { path: '/tmp' } } },
        });

        expect(harness.approvals).toEqual([expect.objectContaining({
            type: 'mcp',
            toolName: 'local',
            serverName: 'local',
            input: { path: '/tmp' },
        })]);
        expect(harness.responses).toHaveLength(1);
        expect(harness.unknown).toHaveLength(0);
    });

    it.each([
        ['item/commandExecution/requestApproval', 'exec'],
        ['item/fileChange/requestApproval', 'patch'],
    ] as const)('routes %s approvals as %s', async (method, type) => {
        const harness = createHarness();

        await handleCodexServerRequest({
            ...harness.options,
            id: 8,
            method,
            params: { itemId: 'item-1', command: 'echo ok', fileChanges: { 'a.txt': 'diff' } },
        });

        expect(harness.approvals[0]).toMatchObject({ type, callId: 'item-1' });
        expect(harness.responses).toHaveLength(1);
    });

    it('responds to unknown requests without invoking approval handlers', async () => {
        const harness = createHarness();

        await handleCodexServerRequest({
            ...harness.options,
            id: 9,
            method: 'unknown/request',
            params: {},
        });

        expect(harness.approvals).toHaveLength(0);
        expect(harness.unknown).toEqual([{ id: 9, method: 'unknown/request' }]);
    });
});
