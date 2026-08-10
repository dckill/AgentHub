import { describe, expect, it, vi } from 'vitest';
import { routeCodexInboundTransportLine } from './codexInboundTransportLifecycle';

describe('routeCodexInboundTransportLine', () => {
    it('routes notifications and server requests through the client-owned callbacks', async () => {
        const onNotification = vi.fn();
        const onServerRequest = vi.fn().mockResolvedValue(undefined);
        const onServerRequestError = vi.fn();

        routeCodexInboundTransportLine({
            line: JSON.stringify({ jsonrpc: '2.0', method: 'turn/started', params: { turnId: 'turn-1' } }),
            sourceEpoch: 3,
            currentEpoch: 3,
            pending: new Map(),
            onInvalidJson: vi.fn(),
            onIgnored: vi.fn(),
            onStaleResponse: vi.fn(),
            onServerRequest,
            onServerRequestError,
            onNotification,
        });
        routeCodexInboundTransportLine({
            line: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'item/commandExecution/requestApproval', params: {} }),
            sourceEpoch: 3,
            currentEpoch: 3,
            pending: new Map(),
            onInvalidJson: vi.fn(),
            onIgnored: vi.fn(),
            onStaleResponse: vi.fn(),
            onServerRequest,
            onServerRequestError,
            onNotification,
        });

        await Promise.resolve();
        expect(onNotification).toHaveBeenCalledWith('turn/started', { turnId: 'turn-1' });
        expect(onServerRequest).toHaveBeenCalledWith(9, 'item/commandExecution/requestApproval', {});
        expect(onServerRequestError).not.toHaveBeenCalled();
    });

    it('does not invoke callbacks for a stale process epoch', () => {
        const callbacks = {
            onInvalidJson: vi.fn(),
            onIgnored: vi.fn(),
            onStaleResponse: vi.fn(),
            onServerRequest: vi.fn(),
            onServerRequestError: vi.fn(),
            onNotification: vi.fn(),
        };

        routeCodexInboundTransportLine({
            line: JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: {} }),
            sourceEpoch: 2,
            currentEpoch: 3,
            pending: new Map(),
            ...callbacks,
        });

        for (const callback of Object.values(callbacks)) {
            expect(callback).not.toHaveBeenCalled();
        }
    });
});
