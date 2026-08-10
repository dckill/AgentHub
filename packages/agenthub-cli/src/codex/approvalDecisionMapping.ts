import type {
    McpServerElicitationRequestResponse,
    ReviewDecision,
} from './codexAppServerTypes';

/** Map an AgentHub approval decision to the legacy or v2 app-server wire value. */
export function mapCodexDecisionToWire(
    decision: ReviewDecision,
    legacy: boolean,
): string | Record<string, unknown> {
    if (typeof decision === 'string') {
        if (legacy) {
            return decision;
        }
        switch (decision) {
            case 'approved': return 'accept';
            case 'approved_for_session': return 'acceptForSession';
            case 'denied': return 'decline';
            case 'abort': return 'cancel';
            default: return 'decline';
        }
    }
    if ('approved_execpolicy_amendment' in decision) {
        return decision;
    }
    return legacy ? 'denied' : 'decline';
}

/** Map an AgentHub approval decision to the MCP elicitation response envelope. */
export function mapCodexDecisionToMcpElicitationResponse(
    decision: ReviewDecision,
    params: { mode?: unknown } | null | undefined,
): McpServerElicitationRequestResponse {
    if (typeof decision === 'string') {
        switch (decision) {
            case 'approved':
            case 'approved_for_session':
                return {
                    action: 'accept',
                    content: params?.mode === 'form' ? {} : null,
                    _meta: null,
                };
            case 'abort':
                return { action: 'cancel', content: null, _meta: null };
            case 'denied':
            default:
                return { action: 'decline', content: null, _meta: null };
        }
    }
    return { action: 'decline', content: null, _meta: null };
}
