import { createServer, type Server as HttpServer } from 'node:http';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { Server as SocketServer } from 'socket.io';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { fileTransferHandler } from '../socket/fileTransferHandler';
import { resolveRedisIntegrationPolicy } from './redisIntegrationPolicy';

const { redisUrl } = resolveRedisIntegrationPolicy();
const describeWithRedis = redisUrl ? describe : describe.skip;

type Replica = {
    http: HttpServer;
    io: SocketServer;
    redis: Redis;
    url: string;
};

async function listenTransferReplica(): Promise<Replica> {
    const redis = new Redis(redisUrl!);
    const http = createServer();
    const io = new SocketServer(http, { transports: ['websocket'] });
    io.adapter(createAdapter(redis, { maxLen: 10_000, readCount: 100 }));
    io.on('connection', (socket) => {
        const clientType = socket.handshake.auth.clientType as string | undefined;
        socket.data.clientType = clientType;
        if (clientType === 'machine-scoped') {
            const machineId = socket.handshake.auth.machineId as string;
            socket.data.machineId = machineId;
            socket.join(`rpc:user-1:${machineId}:readFile`);
        }
        fileTransferHandler('user-1', socket, io);
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Socket replica did not expose a TCP port');
    return { http, io, redis, url: `http://127.0.0.1:${address.port}` };
}

async function connect(url: string, clientType: 'user-scoped' | 'machine-scoped', machineId?: string): Promise<Socket> {
    const socket = createSocketClient(url, {
        transports: ['websocket'],
        reconnection: false,
        auth: { clientType, ...(machineId ? { machineId } : {}) },
    });
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5_000);
        socket.once('connect', () => { clearTimeout(timeout); resolve(); });
        socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error); });
    });
    return socket;
}

describeWithRedis('file transfer across Redis Streams replicas', () => {
    const cleanups: Array<() => Promise<void>> = [];

    afterEach(async () => {
        await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
    });

    it('routes transfer start and chunks between user and machine sockets on different replicas', async () => {
        const control = new Redis(redisUrl!);
        cleanups.push(async () => { control.disconnect(); });
        await control.flushdb();

        const replicaA = await listenTransferReplica();
        const replicaB = await listenTransferReplica();
        cleanups.push(async () => {
            await Promise.allSettled([replicaA.io.close(), replicaB.io.close()]);
            replicaA.http.close();
            replicaB.http.close();
            replicaA.redis.disconnect();
            replicaB.redis.disconnect();
        });

        const user = await connect(replicaA.url, 'user-scoped');
        const machine = await connect(replicaB.url, 'machine-scoped', 'machine-1');
        cleanups.push(async () => { user.disconnect(); machine.disconnect(); });

        let receivedStart: unknown;
        machine.on('file-transfer-start', (payload, acknowledge) => {
            receivedStart = payload;
            acknowledge({ ok: true, totalSize: 3 });
        });
        const receivedChunks: unknown[] = [];
        user.on('file-transfer-chunk', (payload, acknowledge) => {
            receivedChunks.push(payload);
            acknowledge({ ok: true });
        });

        const start = await user.emitWithAck('file-transfer-start', {
            machineId: 'machine-1',
            transferId: 'transfer-1',
            attemptId: 'attempt-1',
            params: 'encrypted-params',
        });
        expect(start).toEqual({ ok: true, totalSize: 3 });
        expect(receivedStart).toEqual(expect.objectContaining({ params: 'encrypted-params' }));

        const chunk = await machine.emitWithAck('file-transfer-chunk', {
            transferId: 'transfer-1',
            targetSocketId: (receivedStart as { targetSocketId: string }).targetSocketId,
            metadata: {
                transferId: 'transfer-1',
                attemptId: 'attempt-1',
                offset: 0,
                bytesRead: 3,
                totalSize: 3,
                done: true,
            },
            bytes: new Uint8Array([1, 2, 3]),
        });

        expect(chunk).toEqual({ ok: true });
        expect(receivedChunks).toEqual([
            expect.objectContaining({ transferId: 'transfer-1', bytes: expect.anything() }),
        ]);
    });
});
