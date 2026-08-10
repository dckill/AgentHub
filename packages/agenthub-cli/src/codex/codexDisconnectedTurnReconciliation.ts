import type { EventMsg, ThreadTurn } from './codexAppServerTypes';
import { selectRecoverableCodexTurns } from './codexTurnRecovery';

export interface ReconcileDisconnectedCodexTurnsOptions {
    threadId: string;
    disconnectedTurnIds: Set<string>;
    completedTurnIds: ReadonlySet<string>;
    readThread: (threadId: string) => Promise<{ thread: { turns?: ThreadTurn[] | null } }>;
    emitEvent: (event: EventMsg) => void;
    markRecoveredTurnId: (turnId: string) => void;
    rememberCompletedTurnId: (turnId: string) => void;
    onError?: (error: unknown) => void;
}

/**
 * Reconcile turns that completed while the app-server process was disconnected.
 * The durable thread snapshot is authoritative; state ownership stays with the
 * caller through the supplied sets and callbacks.
 */
export async function reconcileDisconnectedCodexTurns(
    options: ReconcileDisconnectedCodexTurnsOptions,
): Promise<void> {
    if (options.disconnectedTurnIds.size === 0) {
        return;
    }

    try {
        const { thread } = await options.readThread(options.threadId);
        const recoverableTurns = selectRecoverableCodexTurns({
            turns: thread.turns ?? [],
            disconnectedTurnIds: options.disconnectedTurnIds,
            completedTurnIds: options.completedTurnIds,
        });

        for (const recoveredTurn of recoverableTurns) {
            options.disconnectedTurnIds.delete(recoveredTurn.turnId);
            options.markRecoveredTurnId(recoveredTurn.turnId);
            if (recoveredTurn.alreadyCompleted) {
                continue;
            }

            const finalMessage = recoveredTurn.finalMessage;
            const finalText = finalMessage?.text ?? null;
            if (finalMessage && finalText) {
                options.emitEvent({
                    type: 'agent_message',
                    message: finalText,
                    item_id: finalMessage.id,
                    turn_id: recoveredTurn.turnId,
                    ...(finalMessage.phase ? { phase: finalMessage.phase } : {}),
                });
            }

            options.rememberCompletedTurnId(recoveredTurn.turnId);
            options.emitEvent({
                type: 'task_complete',
                turn_id: recoveredTurn.turnId,
                status: 'completed',
                recovered: true,
            });
        }
    } catch (error) {
        options.onError?.(error);
    }
}
