import type { ApprovalHandler } from './codexAppServerClient';
import type { ReviewDecision } from './codexAppServerTypes';

/** Resolve an approval callback with a fail-closed denied default. */
export async function resolveCodexApproval(
    handler: ApprovalHandler | null,
    params: Parameters<ApprovalHandler>[0],
    onError?: (error: unknown) => void,
): Promise<ReviewDecision> {
    if (!handler) {
        return 'denied';
    }

    try {
        return await handler(params);
    } catch (error) {
        onError?.(error);
        return 'denied';
    }
}
