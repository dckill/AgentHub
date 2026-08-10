export type CodexSteerActiveTurnResult =
    | { steered: true; turnId: string }
    | { steered: false; reason: 'no-active-turn' | 'rejected'; error?: unknown };

export interface SteerCodexActiveTurnOptions {
    threadId: string | null | undefined;
    turnId: string | null | undefined;
    hasPendingTurn: boolean;
    prompt: string;
    clientUserMessageId?: string | null;
    request: (params: {
        threadId: string;
        expectedTurnId: string;
        input: [{ type: 'text'; text: string }];
        clientUserMessageId?: string;
    }) => Promise<{ turnId?: string | null }>;
    onError?: (error: unknown) => void;
}

/** Build and issue a steer request while preserving the active-turn guard. */
export async function steerCodexActiveTurn(
    options: SteerCodexActiveTurnOptions,
): Promise<CodexSteerActiveTurnResult> {
    if (!options.threadId || !options.turnId || !options.hasPendingTurn) {
        return { steered: false, reason: 'no-active-turn' };
    }

    try {
        const result = await options.request({
            threadId: options.threadId,
            expectedTurnId: options.turnId,
            input: [{ type: 'text', text: options.prompt }],
            ...(options.clientUserMessageId ? { clientUserMessageId: options.clientUserMessageId } : {}),
        });
        return { steered: true, turnId: result.turnId || options.turnId };
    } catch (error) {
        options.onError?.(error);
        return { steered: false, reason: 'rejected', error };
    }
}
