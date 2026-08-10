export interface SendCodexTurnOptions<TParams> {
    threadId: string | null | undefined;
    buildParams: () => TParams;
    request: (params: TParams) => Promise<{ turn?: { id?: unknown } }>;
    setTurnId: (turnId: string) => void;
    setPendingTurnId: (turnId: string) => void;
}

/** Issue turn/start and mirror its id into the active and pending turn state. */
export async function sendCodexTurn<TParams>(options: SendCodexTurnOptions<TParams>): Promise<void> {
    if (!options.threadId) {
        throw new Error('No active thread. Call startThread first.');
    }

    const result = await options.request(options.buildParams());
    const turnId = result?.turn?.id;
    if (typeof turnId === 'string' && turnId.length > 0) {
        options.setTurnId(turnId);
        options.setPendingTurnId(turnId);
    }
}
