import type { PendingCodexRequest } from './codexResponseResolution';

/** Reject and remove requests owned by one disconnected app-server epoch. */
export function rejectPendingCodexRequests(
    pending: Map<number, PendingCodexRequest>,
    epoch: number,
    createError: (method: string) => Error,
): number {
    let rejected = 0;
    for (const [id, request] of pending) {
        if (request.epoch !== epoch) continue;
        request.reject(createError(request.method));
        pending.delete(id);
        rejected += 1;
    }
    return rejected;
}
