export type PendingApprovalResponder = (result: unknown) => void;

type ApprovalResponseWriter = (id: number, result: unknown) => void;

export function createPendingApprovalResponder(params: {
    id: number;
    cancelResult: unknown;
    pending: Map<number, () => void>;
    respond: ApprovalResponseWriter;
}): PendingApprovalResponder {
    let responded = false;
    const respondOnce = (result: unknown): void => {
        if (responded) return;
        responded = true;
        params.pending.delete(params.id);
        params.respond(params.id, result);
    };
    params.pending.set(params.id, () => respondOnce(params.cancelResult));
    return respondOnce;
}

export function cancelPendingApprovalResponses(pending: Map<number, () => void>): number {
    const pendingResponses = Array.from(pending.values());
    for (const cancel of pendingResponses) {
        cancel();
    }
    return pendingResponses.length;
}
