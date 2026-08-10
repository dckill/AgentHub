import { log } from "@/utils/log";
import { Server, Socket } from "socket.io";
import type { RemoteSocket } from "socket.io";
import type { DefaultEventsMap } from "socket.io/dist/typed-events";

const RPC_ROOM_PREFIX = 'rpc:';
const FILE_TRANSFER_START_TIMEOUT_MS = 15_000;
const FILE_TRANSFER_CHUNK_TIMEOUT_MS = 15_000;
const FILE_TRANSFER_LOOKUP_TIMEOUT_MS = 2_000;

type RoomSocket = RemoteSocket<DefaultEventsMap, any>;

function rpcRoom(userId: string, method: string): string {
    return `${RPC_ROOM_PREFIX}${userId}:${method}`;
}

async function findMachineTransferSocket(io: Server, userId: string, machineId: string): Promise<RoomSocket | null> {
    const room = rpcRoom(userId, `${machineId}:readFile`);
    try {
        const sockets = await io.in(room)
            .timeout(FILE_TRANSFER_LOOKUP_TIMEOUT_MS)
            .fetchSockets();
        return sockets[0] ?? null;
    } catch (error) {
        log({ module: 'websocket', level: 'error' }, `File transfer socket lookup failed for ${machineId}: ${error}`);
        return null;
    }
}

function firstAckResponse(response: unknown): unknown {
    return Array.isArray(response) ? response[0] : response;
}

function fileTransferRoom(userId: string, machineId: string, transferId: string, attemptId: string): string {
    return ['file-transfer', userId, machineId, transferId, attemptId]
        .map((part) => encodeURIComponent(part))
        .join(':');
}

export function fileTransferHandler(userId: string, socket: Socket, io: Server) {
    socket.on('file-transfer-start', async (data: any, callback: (response: any) => void) => {
        let joinedRoom: string | null = null;
        try {
            if (socket.data.clientType === 'machine-scoped') {
                callback?.({ ok: false, error: 'Machine sockets cannot start file transfers' });
                return;
            }

            const { machineId, transferId, attemptId, params } = data ?? {};
            if (!machineId || typeof machineId !== 'string' || !transferId || typeof transferId !== 'string' || !attemptId || typeof attemptId !== 'string' || typeof params !== 'string') {
                callback?.({ ok: false, error: 'Invalid file transfer start request' });
                return;
            }

            const target = await findMachineTransferSocket(io, userId, machineId);
            if (!target) {
                callback?.({ ok: false, error: 'Machine is not available for file transfer' });
                return;
            }

            joinedRoom = fileTransferRoom(userId, machineId, transferId, attemptId);
            await socket.join(joinedRoom);
            log({ module: 'websocket' }, `File transfer start user=${userId} machine=${machineId} transfer=${transferId} attempt=${attemptId} targetRoom=${joinedRoom}`);
            const response = await target
                .timeout(FILE_TRANSFER_START_TIMEOUT_MS)
                .emitWithAck('file-transfer-start', {
                    params,
                    // Keep the wire field name for CLI compatibility; it now carries
                    // a deterministic Socket.IO room so Redis adapters can route it.
                    targetSocketId: joinedRoom,
                    attemptId,
                });
            const ack = firstAckResponse(response) ?? { ok: false, error: 'No file transfer start response' };
            if (!(ack as any)?.ok) {
                await socket.leave(joinedRoom);
                joinedRoom = null;
                log({ module: 'websocket', level: 'warn' }, `File transfer start rejected user=${userId} machine=${machineId} transfer=${transferId} attempt=${attemptId}: ${(ack as any)?.error || 'unknown error'}`);
            }
            callback?.(ack);
        } catch (error) {
            if (joinedRoom) {
                try {
                    await socket.leave(joinedRoom);
                } catch {
                    // The socket may already be disconnected; cleanup is best effort.
                }
            }
            const message = error instanceof Error ? error.message : 'Failed to start file transfer';
            callback?.({ ok: false, error: message });
        }
    });

    socket.on('file-transfer-cancel', async (data: any, callback: (response: any) => void) => {
        try {
            if (socket.data.clientType === 'machine-scoped') {
                callback?.({ ok: false, error: 'Machine sockets cannot cancel file transfers' });
                return;
            }

            const { machineId, transferId, attemptId, params } = data ?? {};
            if (!machineId || typeof machineId !== 'string' || typeof params !== 'string') {
                callback?.({ ok: false, error: 'Invalid file transfer cancel request' });
                return;
            }
            if (typeof transferId === 'string') {
                if (typeof attemptId === 'string' && attemptId) {
                    await socket.leave(fileTransferRoom(userId, machineId, transferId, attemptId));
                }
                log({ module: 'websocket' }, `File transfer cancel user=${userId} machine=${machineId} transfer=${transferId}`);
            }

            const target = await findMachineTransferSocket(io, userId, machineId);
            if (!target) {
                callback?.({ ok: true });
                return;
            }

            const response = await target
                .timeout(FILE_TRANSFER_START_TIMEOUT_MS)
                .emitWithAck('file-transfer-cancel', { params });
            callback?.(firstAckResponse(response) ?? { ok: true });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to cancel file transfer';
            callback?.({ ok: false, error: message });
        }
    });

    socket.on('file-transfer-chunk', async (data: any, callback: (response: any) => void) => {
        try {
            if (socket.data.clientType !== 'machine-scoped') {
                callback?.({ ok: false, error: 'Only machine sockets can send file transfer chunks' });
                return;
            }

            const machineId = socket.data.machineId as string | undefined;
            const { transferId, targetSocketId, metadata, bytes } = data ?? {};
            if (!machineId || !transferId || typeof transferId !== 'string' || !targetSocketId || typeof targetSocketId !== 'string' || !metadata || typeof metadata !== 'object') {
                callback?.({ ok: false, error: 'Invalid file transfer chunk' });
                return;
            }
            if ((metadata as any).transferId !== transferId) {
                callback?.({ ok: false, error: 'File transfer chunk id mismatch' });
                return;
            }
            const attemptId = (metadata as any).attemptId;
            if (!attemptId || typeof attemptId !== 'string') {
                callback?.({ ok: false, error: 'File transfer chunk attempt is required' });
                return;
            }

            const expectedTargetRoom = fileTransferRoom(userId, machineId, transferId, attemptId);
            if (targetSocketId !== expectedTargetRoom) {
                callback?.({ ok: true, stale: true });
                return;
            }

            const startedAt = Date.now();
            try {
                const response = await io.to(expectedTargetRoom)
                    .timeout(FILE_TRANSFER_CHUNK_TIMEOUT_MS)
                    .emitWithAck('file-transfer-chunk', {
                        transferId,
                        metadata,
                        bytes: bytes ?? new Uint8Array(),
                    });
                const ack = firstAckResponse(response) ?? { ok: true };
                const duration = Date.now() - startedAt;
                if (!(ack as any)?.ok || duration > 1000 || (metadata as any).done) {
                    log({ module: 'websocket', level: (ack as any)?.ok === false ? 'warn' : 'info' }, `File transfer chunk forwarded user=${userId} machine=${machineId} transfer=${transferId} attempt=${attemptId} offset=${(metadata as any).offset} bytes=${(metadata as any).bytesRead} done=${!!(metadata as any).done} targetRoom=${expectedTargetRoom} durationMs=${duration} ok=${(ack as any)?.ok !== false} error=${(ack as any)?.error || ''}`);
                }
                callback?.(ack);
            } catch (error) {
                const duration = Date.now() - startedAt;
                const message = error instanceof Error ? error.message : 'Failed to forward file transfer chunk';
                log({ module: 'websocket', level: 'error' }, `File transfer chunk failed user=${userId} machine=${machineId} transfer=${transferId} attempt=${attemptId} offset=${(metadata as any).offset} bytes=${(metadata as any).bytesRead} done=${!!(metadata as any).done} targetRoom=${expectedTargetRoom} durationMs=${duration}: ${message}`);
                callback?.({ ok: false, error: message });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to forward file transfer chunk';
            callback?.({ ok: false, error: message });
        }
    });
}
