import type { ThreadTurn } from './codexAppServerTypes';

/** Returns the durable completion signal used when reconciling a thread after reconnect. */
export function isCompletedThreadTurn(
    turn: Pick<ThreadTurn, 'status' | 'completedAt'>,
): boolean {
    const status = typeof turn.status === 'string' ? turn.status : null;
    if (status) {
        return status === 'completed';
    }
    return turn.completedAt !== undefined && turn.completedAt !== null;
}
