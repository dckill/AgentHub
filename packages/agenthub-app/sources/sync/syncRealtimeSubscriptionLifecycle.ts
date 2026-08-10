import {
    subscribeToAccountRealtime,
    type RealtimeSubscriptionSocket,
} from './realtimeSubscriptionLifecycle';

export function bindSyncRealtimeEvents(options: {
    socket: RealtimeSubscriptionSocket;
    generation: number;
    handleUpdate: (update: unknown, generation: number) => Promise<void>;
    handleEphemeralUpdate: (update: unknown, generation: number) => void;
    handleReconnect: (generation: number) => void;
    isCurrent: () => boolean;
    reportError: (error: unknown) => void;
}): () => void {
    return subscribeToAccountRealtime(options.socket, {
        onUpdate: (update) => {
            void options.handleUpdate(update, options.generation).catch((error) => {
                if (options.isCurrent()) {
                    options.reportError(error);
                }
            });
        },
        onEphemeral: (update) => options.handleEphemeralUpdate(update, options.generation),
        onReconnect: () => options.handleReconnect(options.generation),
    });
}
