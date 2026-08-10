import type { ThreadTurn } from './codexAppServerTypes';
import { isCompletedThreadTurn } from './turnCompletion';
import { getLastAgentMessage, type ThreadAgentMessage } from './threadTurnMessage';

export type RecoverableCodexTurn = {
    turnId: string;
    finalMessage: ThreadAgentMessage | null;
    alreadyCompleted?: true;
};

/** Select disconnected turns that can be recovered from the durable thread snapshot. */
export function selectRecoverableCodexTurns(input: {
    turns: ThreadTurn[];
    disconnectedTurnIds: ReadonlySet<string>;
    completedTurnIds: ReadonlySet<string>;
}): RecoverableCodexTurn[] {
    const recoverable: RecoverableCodexTurn[] = [];
    for (const turn of input.turns) {
        if (!input.disconnectedTurnIds.has(turn.id) || !isCompletedThreadTurn(turn)) {
            continue;
        }

        const finalMessage = getLastAgentMessage(turn);
        if (input.completedTurnIds.has(turn.id)) {
            recoverable.push({ turnId: turn.id, finalMessage, alreadyCompleted: true });
        } else {
            recoverable.push({ turnId: turn.id, finalMessage });
        }
    }
    return recoverable;
}
