type RealtimeHandler = (value: unknown) => void;

export type RealtimeSubscriptionSocket = {
    onMessage: (event: string, handler: RealtimeHandler) => () => unknown;
    onReconnected: (handler: () => void) => () => unknown;
};

export type AccountRealtimeHandlers = {
    onUpdate: RealtimeHandler;
    onEphemeral: RealtimeHandler;
    onReconnect: () => void;
};

/** Register all account-scoped Socket.IO listeners and return an idempotent cleanup. */
export function subscribeToAccountRealtime(
    socket: RealtimeSubscriptionSocket,
    handlers: AccountRealtimeHandlers,
): () => void {
    const cleanup = [
        socket.onMessage('update', handlers.onUpdate),
        socket.onMessage('ephemeral', handlers.onEphemeral),
        socket.onReconnected(handlers.onReconnect),
    ];
    let active = true;
    return () => {
        if (!active) return;
        active = false;
        for (const cancel of cleanup) cancel();
    };
}
