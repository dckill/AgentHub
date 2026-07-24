import { describe, expect, it, vi } from 'vitest';

describe('Socket event resource limits', () => {
    it('acks and drops events after the per-socket budget', async () => {
        const module = await import('./enableSocketResourceLimits').catch(() => ({} as any));
        expect(module.enableSocketResourceLimits).toBeTypeOf('function');
        let middleware!: (packet: unknown[], next: (error?: Error) => void) => void;
        const socket = { use: vi.fn((handler) => { middleware = handler; }), emit: vi.fn() };
        module.enableSocketResourceLimits(socket, { eventLimit: 2, fileChunkLimit: 2, windowMs: 1_000 });
        const ack = vi.fn();
        const next = vi.fn();

        middleware(['rpc-presence', {}, ack], next);
        middleware(['rpc-presence', {}, ack], next);
        middleware(['rpc-presence', {}, ack], next);

        await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(2));
        expect(ack).toHaveBeenCalledWith({ ok: false, error: 'rate-limit', retryAfterMs: expect.any(Number) });
    });

    it('tracks file chunks separately from control events', async () => {
        const module = await import('./enableSocketResourceLimits').catch(() => ({} as any));
        expect(module.enableSocketResourceLimits).toBeTypeOf('function');
        let middleware!: (packet: unknown[], next: (error?: Error) => void) => void;
        const socket = { use: vi.fn((handler) => { middleware = handler; }), emit: vi.fn() };
        module.enableSocketResourceLimits(socket, { eventLimit: 1, fileChunkLimit: 1, windowMs: 1_000 });
        const next = vi.fn();

        middleware(['rpc-presence', {}, vi.fn()], next);
        middleware(['file-transfer-chunk', {}, vi.fn()], next);

        await vi.waitFor(() => expect(next).toHaveBeenCalledTimes(2));
    });
});
