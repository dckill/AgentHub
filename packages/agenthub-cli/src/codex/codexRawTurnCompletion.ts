import type { EventMsg } from './codexAppServerTypes';

export type EmitCodexRawTurnCompletionParams = {
    turnId: string | null;
    status: string | null;
    error: unknown;
    source: string;
    tryResolvePendingTurn: (aborted: boolean, turnId: string | null, source: string) => void;
    clearTurn: () => void;
    hasCompletedTurn: (turnId: string) => boolean;
    rememberCompletedTurn: (turnId: string) => void;
    emit: (event: EventMsg) => void;
};

/** Translate a raw turn completion into one terminal event with bounded de-duplication. */
export function emitCodexRawTurnCompletion(params: EmitCodexRawTurnCompletionParams): void {
    const aborted = params.status === 'cancelled'
        || params.status === 'canceled'
        || params.status === 'aborted'
        || params.status === 'interrupted';

    params.tryResolvePendingTurn(aborted, params.turnId, params.source);
    params.clearTurn();

    if (params.turnId && params.hasCompletedTurn(params.turnId)) {
        return;
    }
    if (params.turnId) {
        params.rememberCompletedTurn(params.turnId);
    }

    params.emit({
        type: aborted ? 'turn_aborted' : 'task_complete',
        ...(params.turnId ? { turn_id: params.turnId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.error !== undefined && params.error !== null ? { error: params.error } : {}),
    });
}
