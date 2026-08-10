import fastify, { type FastifyInstance } from 'fastify';
import { createServer, type Server as HttpServer } from 'node:http';
import { Redis } from 'ioredis';
import { Server as SocketServer } from 'socket.io';
import { io as createSocketClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { enableResourceLimits } from './enableResourceLimits';
import { enableSocketResourceLimits } from './enableSocketResourceLimits';
import { resolveRedisIntegrationPolicy } from './redisIntegrationPolicy';

const { redisUrl } = resolveRedisIntegrationPolicy();
const describeWithRedis = redisUrl ? describe : describe.skip;

async function listenHttp(app: FastifyInstance): Promise<string> {
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP test server did not expose a TCP port');
    return `http://127.0.0.1:${address.port}`;
}

async function listenSocket(redis: Redis): Promise<{ http: HttpServer; io: SocketServer; url: string }> {
    const http = createServer();
    const io = new SocketServer(http, { transports: ['websocket'] });
    io.on('connection', (socket) => {
        enableSocketResourceLimits(socket, {
            eventLimit: 1,
            fileChunkLimit: 1,
            windowMs: 60_000,
            redis,
            subject: 'shared-account',
        });
        socket.on('control', (_payload, ack) => ack({ ok: true }));
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (!address || typeof address === 'string') throw new Error('Socket test server did not expose a TCP port');
    return { http, io, url: `http://127.0.0.1:${address.port}` };
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

describeWithRedis('distributed HTTP and Socket resource limits', () => {
    const cleanups: Array<() => Promise<void>> = [];
    afterEach(async () => {
        await Promise.allSettled(cleanups.splice(0).map((cleanup) => cleanup()));
    });

    it('enforces one HTTP allowance across two independently listening servers', async () => {
        const redisA = new Redis(redisUrl!);
        const redisB = new Redis(redisUrl!);
        cleanups.push(async () => { redisA.disconnect(); redisB.disconnect(); });
        await redisA.flushdb();
        const appA = fastify();
        const appB = fastify();
        enableResourceLimits(appA, { readLimit: 1, windowMs: 60_000, redis: redisA });
        enableResourceLimits(appB, { readLimit: 1, windowMs: 60_000, redis: redisB });
        appA.get('/read', async () => ({ server: 'A' }));
        appB.get('/read', async () => ({ server: 'B' }));
        const urlA = await listenHttp(appA);
        const urlB = await listenHttp(appB);
        cleanups.push(async () => { await appA.close(); await appB.close(); });

        expect((await fetch(`${urlA}/read`)).status).toBe(200);
        const limited = await fetch(`${urlB}/read`);
        expect(limited.status).toBe(429);
        expect(limited.headers.get('retry-after')).toBe('60');
        await expect(limited.json()).resolves.toMatchObject({ error: 'rate-limit' });
    });

    it('enforces one Socket event allowance across two independently listening servers', async () => {
        const redisA = new Redis(redisUrl!);
        const redisB = new Redis(redisUrl!);
        cleanups.push(async () => { redisA.disconnect(); redisB.disconnect(); });
        await redisA.flushdb();
        const serverA = await listenSocket(redisA);
        const serverB = await listenSocket(redisB);
        cleanups.push(async () => {
            await Promise.all([serverA.io.close(), serverB.io.close()]);
            serverA.http.close();
            serverB.http.close();
        });
        const clientA = await connect(serverA.url);
        const clientB = await connect(serverB.url);
        cleanups.push(async () => { clientA.disconnect(); clientB.disconnect(); });

        await expect(clientA.timeout(5_000).emitWithAck('control', {})).resolves.toEqual({ ok: true });
        await expect(clientB.timeout(5_000).emitWithAck('control', {})).resolves.toMatchObject({
            ok: false,
            error: 'rate-limit',
        });
    });
});
