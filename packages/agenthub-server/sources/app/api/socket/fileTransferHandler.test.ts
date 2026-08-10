import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/log', () => ({ log: vi.fn() }));

type HandlerSocket = {
    id: string;
    data: Record<string, unknown>;
    on: ReturnType<typeof vi.fn>;
    join: ReturnType<typeof vi.fn>;
    leave: ReturnType<typeof vi.fn>;
};

function createSocket(id: string, data: Record<string, unknown>): HandlerSocket & { handlers: Map<string, Function> } {
    const handlers = new Map<string, Function>();
    const socket = {
        id,
        data,
        handlers,
        on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
        join: vi.fn(async () => undefined),
        leave: vi.fn(async () => undefined),
    } as HandlerSocket & { handlers: Map<string, Function> };
    return socket;
}

describe('fileTransferHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('forwards chunks across independent server instances without a process-local target map', async () => {
        const { fileTransferHandler } = await import('./fileTransferHandler');
        const userSocket = createSocket('user-socket-a', { clientType: 'user-scoped' });
        const machineSocket = createSocket('machine-socket-b', {
            clientType: 'machine-scoped',
            machineId: 'machine-1',
        });
        const startAck = vi.fn().mockResolvedValue([{ ok: true, totalSize: 3 }]);
        const remoteUserSocket = {
            id: userSocket.id,
            timeout: vi.fn(() => ({ emitWithAck: startAck })),
        };
        const ioA = {
            in: vi.fn(() => ({
                timeout: vi.fn(() => ({ fetchSockets: vi.fn().mockResolvedValue([remoteUserSocket]) })),
            })),
        } as any;
        const forwardedAck = vi.fn().mockResolvedValue([{ ok: true }]);
        const ioB = {
            to: vi.fn(() => ({
                timeout: vi.fn(() => ({ emitWithAck: forwardedAck })),
            })),
        } as any;

        fileTransferHandler('user-1', userSocket as any, ioA);
        fileTransferHandler('user-1', machineSocket as any, ioB);

        const startResponse = vi.fn();
        await userSocket.handlers.get('file-transfer-start')?.({
            machineId: 'machine-1',
            transferId: 'transfer-1',
            attemptId: 'attempt-1',
            params: 'encrypted-params',
        }, startResponse);

        expect(startResponse).toHaveBeenCalledWith({ ok: true, totalSize: 3 });
        const startPayload = startAck.mock.calls[0]?.[1] as { targetSocketId: string };
        expect(startPayload.targetSocketId).toEqual(expect.any(String));
        expect(userSocket.join).toHaveBeenCalled();

        const chunkResponse = vi.fn();
        await machineSocket.handlers.get('file-transfer-chunk')?.({
            transferId: 'transfer-1',
            targetSocketId: startPayload.targetSocketId,
            metadata: {
                transferId: 'transfer-1',
                attemptId: 'attempt-1',
                offset: 0,
                bytesRead: 3,
                totalSize: 3,
                done: true,
            },
            bytes: new Uint8Array([1, 2, 3]),
        }, chunkResponse);

        expect(ioB.to).toHaveBeenCalledWith(startPayload.targetSocketId);
        expect(forwardedAck).toHaveBeenCalledWith('file-transfer-chunk', expect.objectContaining({
            transferId: 'transfer-1',
        }));
        expect(chunkResponse).toHaveBeenCalledWith({ ok: true });
    });
});
