import type { ThreadTurn } from './codexAppServerTypes';

export type ThreadAgentMessage = {
    id: string;
    text: string;
    phase?: string | null;
};

/** Selects the durable final textual agent message from a completed thread turn. */
export function getLastAgentMessage(
    turn: Pick<ThreadTurn, 'items'>,
): ThreadAgentMessage | null {
    for (const item of [...(turn.items ?? [])].reverse()) {
        if (item.type === 'agentMessage' && typeof item.text === 'string') {
            return {
                id: item.id,
                text: item.text,
                phase: typeof item.phase === 'string' ? item.phase : null,
            };
        }
    }
    return null;
}
