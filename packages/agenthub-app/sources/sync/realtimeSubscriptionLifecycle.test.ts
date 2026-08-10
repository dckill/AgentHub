import { describe, expect, it, vi } from 'vitest';
import { subscribeToAccountRealtime } from './realtimeSubscriptionLifecycle';

type Handler = (value?: unknown) => void;

function createSocket() {
    const handlers = new Map<string, Handler>();
    const reconnectHandlers = new Set<Handler>();
    const unsubscribers = vi.fn();
    return {
        handlers,
        reconnectHandlers,
        unsubscribers,
        socket: {
            onMessage(event: string, handler: Handler) {
                handlers.set(event, handler);
                return () => {
                    handlers.delete(event);
                    unsubscribers();
                };
            },
            onReconnected(handler: Handler) {
                reconnectHandlers.add(handler);
                return () => {
                    reconnectHandlers.delete(handler);
                    unsubscribers();
                };
            },
        },
    };
}

describe('subscribeToAccountRealtime', () => {
    it('registers update, ephemeral, and reconnect handlers without changing payloads', () => {
        const fake = createSocket();
        const onUpdate = vi.fn();
        const onEphemeral = vi.fn();
        const onReconnect = vi.fn();

        subscribeToAccountRealtime(fake.socket, { onUpdate, onEphemeral, onReconnect });

        const update = { body: { t: 'update-session' } };
        const ephemeral = { type: 'machine-activity' };
        fake.handlers.get('update')?.(update);
        fake.handlers.get('ephemeral')?.(ephemeral);
        for (const handler of fake.reconnectHandlers) handler();

        expect(onUpdate).toHaveBeenCalledWith(update);
        expect(onEphemeral).toHaveBeenCalledWith(ephemeral);
        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('cleans every account-scoped listener exactly once', () => {
        const fake = createSocket();
        const cancel = subscribeToAccountRealtime(fake.socket, {
            onUpdate: vi.fn(),
            onEphemeral: vi.fn(),
            onReconnect: vi.fn(),
        });

        cancel();
        cancel();

        expect(fake.handlers.size).toBe(0);
        expect(fake.reconnectHandlers.size).toBe(0);
        expect(fake.unsubscribers).toHaveBeenCalledTimes(3);
    });
});
