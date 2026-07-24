import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./serverConfig', () => ({ getServerUrl: () => 'https://server.test' }));
vi.mock('./apiSocket', () => ({ getAgentHubClientId: () => 'web/test' }));

import { kvBulkGet, kvGet, kvMutate } from './apiKv';

const credentials = { token: 'token', secret: 'secret' };
const response = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
} as Response);

describe('apiKv typed HTTP adapter', () => {
    beforeEach(() => vi.stubGlobal('fetch', vi.fn()));

    it('maps an accepted 404 to a missing KV value', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(response(404, { error: 'missing' }));
        await expect(kvGet(credentials, 'missing key')).resolves.toBeNull();
        expect(fetch).toHaveBeenCalledWith('https://server.test/v1/kv/missing%20key', expect.objectContaining({
            signal: expect.any(AbortSignal),
        }));
    });

    it('preserves 409 optimistic-concurrency responses as business data', async () => {
        const conflict = {
            success: false as const,
            errors: [{ key: 'k', error: 'version-mismatch' as const, version: 2, value: 'current' }],
        };
        vi.mocked(fetch).mockResolvedValueOnce(response(409, conflict));
        await expect(kvMutate(credentials, [{ key: 'k', value: 'next', version: 1 }])).resolves.toEqual(conflict);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('marks bulk reads idempotent while retaining POST transport', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(response(200, { values: [] }));
        await expect(kvBulkGet(credentials, ['a'])).resolves.toEqual({ values: [] });
        expect(fetch).toHaveBeenCalledWith('https://server.test/v1/kv/bulk', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ keys: ['a'] }),
        }));
    });
});
