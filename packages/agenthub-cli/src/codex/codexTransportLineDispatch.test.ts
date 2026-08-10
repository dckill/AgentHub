import { describe, expect, it, vi } from 'vitest';
import type { PendingCodexRequest } from './codexResponseResolution';
import { dispatchCodexTransportLine } from './codexTransportLineDispatch';

function pendingRequest(epoch: number, resolve = vi.fn(), reject = vi.fn()): PendingCodexRequest {
    return { resolve, reject, method: 'thread/start', epoch };
}

describe('dispatchCodexTransportLine', () => {
    it('ignores lines from a stale process epoch before parsing', () => {
        const parseLog = vi.fn();
        const onNotification = vi.fn();

        dispatchCodexTransportLine({
            line: '{"method":"turn/started"}',
            sourceEpoch: 1,
            currentEpoch: 2,
            pending: new Map(),
            onInvalidJson: parseLog,
            onIgnored: parseLog,
            onNotification,
            onServerRequest: vi.fn(),
            onServerRequestError: vi.fn(),
            onStaleResponse: vi.fn(),
        });

        expect(parseLog).not.toHaveBeenCalled();
        expect(onNotification).not.toHaveBeenCalled();
    });

    it('settles a current-epoch response and routes requests/notifications', async () => {
        const resolve = vi.fn();
        const pending = new Map([[7, pendingRequest(3, resolve)]]);
        const onServerRequest = vi.fn().mockResolvedValue(undefined);
        const onNotification = vi.fn();

        dispatchCodexTransportLine({
            line: '{"id":7,"result":{"ok":true}}',
            sourceEpoch: 3,
            currentEpoch: 3,
            pending,
            onInvalidJson: vi.fn(),
            onIgnored: vi.fn(),
            onNotification,
            onServerRequest,
            onServerRequestError: vi.fn(),
            onStaleResponse: vi.fn(),
        });
        dispatchCodexTransportLine({
            line: '{"id":8,"method":"item/approval","params":{"path":"/tmp"}}',
            sourceEpoch: 3,
            currentEpoch: 3,
            pending,
            onInvalidJson: vi.fn(),
            onIgnored: vi.fn(),
            onNotification,
            onServerRequest,
            onServerRequestError: vi.fn(),
            onStaleResponse: vi.fn(),
        });
        dispatchCodexTransportLine({
            line: '{"method":"turn/started","params":{"turnId":"turn-1"}}',
            sourceEpoch: 3,
            currentEpoch: 3,
            pending,
            onInvalidJson: vi.fn(),
            onIgnored: vi.fn(),
            onNotification,
            onServerRequest,
            onServerRequestError: vi.fn(),
            onStaleResponse: vi.fn(),
        });

        await Promise.resolve();
        expect(resolve).toHaveBeenCalledWith({ ok: true });
        expect(onServerRequest).toHaveBeenCalledWith(8, 'item/approval', { path: '/tmp' });
        expect(onNotification).toHaveBeenCalledWith('turn/started', { turnId: 'turn-1' });
    });
});
