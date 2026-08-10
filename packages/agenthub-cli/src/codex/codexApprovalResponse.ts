import type {
    McpServerElicitationRequestResponse,
    ReviewDecision,
} from './codexAppServerTypes';
import type { CodexApprovalRequest } from './codexApprovalRouting';
import {
    mapCodexDecisionToMcpElicitationResponse,
    mapCodexDecisionToWire,
} from './approvalDecisionMapping';

export type CodexApprovalWireResponse =
    | McpServerElicitationRequestResponse
    | { decision: string | Record<string, unknown> };

/** Extract the MCP tool name when the provider includes it in a message. */
export function extractCodexApprovalToolName(message: unknown): string | null {
    if (typeof message !== 'string') {
        return null;
    }
    const match = message.match(/tool "([^"]+)"/i);
    return match?.[1] ?? null;
}

/** Build the provider-specific response for an approval decision. */
export function buildCodexApprovalResponse(
    approval: CodexApprovalRequest,
    decision: ReviewDecision,
    params?: { mode?: unknown } | null,
): CodexApprovalWireResponse {
    if (approval.kind === 'mcp') {
        return mapCodexDecisionToMcpElicitationResponse(decision, params);
    }
    return {
        decision: mapCodexDecisionToWire(decision, approval.legacy),
    };
}
