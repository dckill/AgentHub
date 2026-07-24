import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createBackoff } from '@/utils/time';
import { createAuthenticatedHttpClient } from './httpClient';

const credentials = { token: 'token', secret: 'secret' };
let server: Server;
let baseUrl = '';
const counts = new Map<string, number>();

describe('authenticated HTTP client integration', () => {
    beforeAll(async () => {
        server = createServer((request, response) => {
            const path = request.url ?? '/';
            counts.set(path, (counts.get(path) ?? 0) + 1);
            response.setHeader('content-type', 'application/json');
            if (path === '/slow') return;
            if (path === '/unauthorized') {
                response.writeHead(401).end(JSON.stringify({ error: 'unauthorized' }));
                return;
            }
            if (path === '/rate' && counts.get(path) === 1) {
                response.writeHead(429).end(JSON.stringify({ error: 'rate limited' }));
                return;
            }
            if (path === '/unavailable' && counts.get(path) === 1) {
                response.writeHead(503).end(JSON.stringify({ error: 'unavailable' }));
                return;
            }
            response.writeHead(200).end(JSON.stringify({ ok: true }));
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('HTTP fixture did not bind');
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    const client = () => createAuthenticatedHttpClient({
        getBaseUrl: () => baseUrl,
        getClientId: () => 'integration/test',
        retry: createBackoff({ minDelay: 0, maxDelay: 0, maxAttempts: 3 }),
    });

    it('does not retry a real 401 response', async () => {
        await expect(client().request(credentials, '/unauthorized')).rejects.toMatchObject({ status: 401 });
        expect(counts.get('/unauthorized')).toBe(1);
    });

    it.each(['/rate', '/unavailable'])('recovers from transient %s responses', async (path) => {
        await expect(client().request(credentials, path)).resolves.toMatchObject({ data: { ok: true } });
        expect(counts.get(path)).toBe(2);
    });

    it('aborts a real pending response at the configured timeout', async () => {
        await expect(client().request(credentials, '/slow', { method: 'POST', timeoutMs: 30 }))
            .rejects.toMatchObject({ name: 'TimeoutError' });
        expect(counts.get('/slow')).toBe(1);
    });
});
