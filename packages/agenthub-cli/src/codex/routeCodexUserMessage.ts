export type CodexTurnSteerClient = {
    hasSteerableActiveTurn: () => boolean;
    steerActiveTurn: (
        prompt: string,
        opts?: { clientUserMessageId?: string | null },
    ) => Promise<{ steered: true; turnId: string } | { steered: false; reason: string; error?: unknown }>;
};

export type CodexMessageQueue<TMode> = {
    push: (message: string, mode: TMode) => void;
};

export async function routeCodexUserMessage<TMode>(opts: {
    client: CodexTurnSteerClient;
    queue: CodexMessageQueue<TMode>;
    text: string;
    mode: TMode;
    clientUserMessageId?: string | null;
}): Promise<'steered' | 'queued'> {
    if (opts.client.hasSteerableActiveTurn()) {
        const result = await opts.client.steerActiveTurn(opts.text, {
            clientUserMessageId: opts.clientUserMessageId,
        });
        if (result.steered) {
            return 'steered';
        }
    }

    opts.queue.push(opts.text, opts.mode);
    return 'queued';
}
