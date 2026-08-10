import { createServer, type Server as HttpServer } from 'node:http';
import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { Server as SocketServer } from 'socket.io';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveRedisIntegrationPolicy } from './redisIntegrationPolicy';

const { redisUrl } = resolveRedisIntegrationPolicy();
const describeWithRedis = redisUrl ? describe : describe.skip;
const room = 'redis-streams-cross-replica-room';

type Replica = {
    http: HttpServer;
    io: SocketServer;
    redis: Redis;
    url: string;
};

async function listenReplica(label: string): Promise<Replica> {
    const redis = new Redis(redisUrl!);
    const http = createServer();
    const io = new SocketServer(http, { transports: ['websocket'] });
    io.adapter(createAdapter(redis, { maxLen: 10_000, readCount: 100 }));
    io.on('connection', (socket) => {
        socket.join(room);
        socket.emit('replica-ready', label);
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Socket replica did not expose a TCP port');
    return { http, io, redis, url: `http://127.0.0.1:${address.port}` };
}

async function connect(url: string): Promise<Socket> {
    const socket = createSocketClient(url, { transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5_000);
        socket.once('connect', () => { clearTimeout(timeout); resolve(); });
        socket.once('connect_error', (error) => { clearTimeout(timeout); reject(error); });
    });
    return socket;
}

describeWithRedis('Redis Streams adapter cross-replica routing', () => {
    const cleanups: Array<() => Promise<void>> = [];

    afterEach(async () => {
        await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
    });

    it('routes room broadcasts and fetchSockets across two independently listening replicas', async () => {
        const control = new Redis(redisUrl!);
        cleanups.push(async () => { control.disconnect(); });
        await control.flushdb();

        const replicaA = await listenReplica('A');
        const replicaB = await listenReplica('B');
        cleanups.push(async () => {
            await Promise.allSettled([replicaA.io.close(), replicaB.io.close()]);
            replicaA.http.close();
            replicaB.http.close();
            replicaA.redis.disconnect();
            replicaB.redis.disconnect();
        });

        const clientA = await connect(replicaA.url);
        const clientB = await connect(replicaB.url);
        cleanups.push(async () => { clientA.disconnect(); clientB.disconnect(); });

        await expect(replicaA.io.in(room).fetchSockets()).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: clientA.id }),
                expect.objectContaining({ id: clientB.id }),
            ]),
        );

        const received = new Promise<string>((resolve) => clientB.once('cross-replica-event', resolve));
        replicaA.io.to(room).emit('cross-replica-event', 'from-A');
        await expect(received).resolves.toBe('from-A');
    });
});
