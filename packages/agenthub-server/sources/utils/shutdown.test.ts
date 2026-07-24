import { afterEach, describe, expect, it, vi } from 'vitest';

const originalSigintListeners = new Set(process.listeners('SIGINT'));
const originalSigtermListeners = new Set(process.listeners('SIGTERM'));

afterEach(() => {
    for (const listener of process.listeners('SIGINT')) {
        if (!originalSigintListeners.has(listener)) process.removeListener('SIGINT', listener);
    }
    for (const listener of process.listeners('SIGTERM')) {
        if (!originalSigtermListeners.has(listener)) process.removeListener('SIGTERM', listener);
    }
    vi.resetModules();
});

describe('server shutdown ordering', () => {
    it('waits for keepAlive work before closing dependent resources', async () => {
        vi.resetModules();
        const { awaitShutdown, onShutdown } = await import('./shutdown');
        const order: string[] = [];

        onShutdown('api', async () => {
            order.push('api:start');
            await Promise.resolve();
            order.push('api:stopped');
        });
        onShutdown('keepAlive:test-background-work', async () => {
            order.push('background:start');
            await Promise.resolve();
            order.push('background:stopped');
        });
        onShutdown('db', async () => {
            order.push('database:disconnect');
        });

        const completed = awaitShutdown();
        process.emit('SIGTERM');
        await completed;

        expect(order).toEqual([
            'api:start',
            'api:stopped',
            'background:start',
            'background:stopped',
            'database:disconnect',
        ]);
    });
});
