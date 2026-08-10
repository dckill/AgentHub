export interface PendingTurnResolutionInput {
    pendingTurnId: string | null;
    notificationTurnId: string | null;
}

/**
 * A completion without either side's turn id is still usable for fast/legacy
 * turns; only an explicit mismatch is stale and must be ignored.
 */
export function shouldResolvePendingTurn({
    pendingTurnId,
    notificationTurnId,
}: PendingTurnResolutionInput): boolean {
    return !pendingTurnId || !notificationTurnId || pendingTurnId === notificationTurnId;
}
