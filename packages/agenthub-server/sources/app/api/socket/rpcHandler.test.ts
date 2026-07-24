import { describe, expect, it, vi } from 'vitest';
import { rpcHandler } from './rpcHandler';

describe('rpcHandler presence', () => {
    it('reports whether an RPC method currently has a target socket', async () => {
        const handlers: Record<string, Function> = {};
        const fetchSockets = vi.fn(async () => [{ id: 'target-socket' }]);
        const socket = {
            id: 'caller-socket',
            on: vi.fn((event: string, handler: Function) => {
                handlers[event] = handler;
            }),
            emit: vi.fn(),
            join: vi.fn(),
            leave: vi.fn(),
        };
        const io = {
            in: vi.fn(() => ({
                timeout: vi.fn(() => ({
                    fetchSockets,
                })),
            })),
        };
        const callback = vi.fn();

        rpcHandler('user-1', socket as any, io as any);
        await handlers['rpc-presence']({ method: 'session-1:getDirectoryTree' }, callback);

        expect(io.in).toHaveBeenCalledWith('rpc:user-1:session-1:getDirectoryTree');
        expect(callback).toHaveBeenCalledWith({ ok: true, available: true });
    });

    it('rejects calls beyond the per-socket in-flight budget before lookup', async () => {
        const handlers: Record<string, Function> = {};
        const releases: Array<() => void> = [];
        const target = {
            id: 'target-socket',
            timeout: vi.fn(() => target),
            emitWithAck: vi.fn(() => new Promise((resolve) => releases.push(() => resolve({ ok: true })))),
        };
        const fetchSockets = vi.fn(async () => [target]);
        const socket = {
            id: 'caller-socket',
            on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }),
            emit: vi.fn(),
            join: vi.fn(),
            leave: vi.fn(),
        };
        const io = {
            in: vi.fn(() => ({ timeout: vi.fn(() => ({ fetchSockets })) })),
        };
        rpcHandler('user-1', socket as any, io as any);
        const callbacks = Array.from({ length: 9 }, () => vi.fn());

        const calls = callbacks.map((callback) => handlers['rpc-call']({ method: 'machine-1:readFile', params: {} }, callback));
        await Promise.resolve();
        await Promise.resolve();
        const ninthBeforeRelease = callbacks[8].mock.calls[0]?.[0];
        releases.forEach((release) => release());
        await Promise.all(calls);

        expect(ninthBeforeRelease).toEqual({ ok: false, error: 'Too many in-flight RPC calls' });
        expect(fetchSockets).toHaveBeenCalledTimes(8);
    });
});
