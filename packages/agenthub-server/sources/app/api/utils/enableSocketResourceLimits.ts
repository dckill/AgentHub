import { DistributedFixedWindowRateLimiter, type RedisRateLimitClient } from './distributedRateLimits';
import { getRateLimitRedisClient, reportRateLimitRedisError } from './rateLimitRedis';

type SocketLimitOptions = {
    eventLimit?: number;
    fileChunkLimit?: number;
    windowMs?: number;
    redis?: RedisRateLimitClient;
    subject?: string;
};

type LimitedSocket = {
    use: (handler: (packet: unknown[], next: (error?: Error) => void) => void) => void;
    emit: (event: string, payload: unknown) => unknown;
};

export function enableSocketResourceLimits(socket: LimitedSocket, options: SocketLimitOptions = {}): void {
    const windowMs = options.windowMs ?? 60_000;
    const redis = options.redis ?? getRateLimitRedisClient();
    const controls = new DistributedFixedWindowRateLimiter({ scope: 'socket-control', limit: options.eventLimit ?? 1_200, windowMs, maxFallbackSubjects: 1, redis, onRedisError: reportRateLimitRedisError });
    const chunks = new DistributedFixedWindowRateLimiter({ scope: 'socket-file-chunk', limit: options.fileChunkLimit ?? 6_000, windowMs, maxFallbackSubjects: 1, redis, onRedisError: reportRateLimitRedisError });
    const subject = options.subject ?? 'socket';

    socket.use((packet, next) => {
        const event = typeof packet[0] === 'string' ? packet[0] : 'unknown';
        void (event === 'file-transfer-chunk' ? chunks : controls).consume(subject).then((result) => {
            if (result.allowed) {
                next();
                return;
            }
            const payload = { ok: false, error: 'rate-limit', retryAfterMs: result.retryAfterMs };
            const ack = packet.at(-1);
            if (typeof ack === 'function') ack(payload);
            else socket.emit('resource-error', payload);
        });
    });
}
