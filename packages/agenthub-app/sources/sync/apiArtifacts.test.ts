import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./serverConfig', () => ({ getServerUrl: () => 'https://server.example' }));
vi.mock('./apiSocket', () => ({ getAgentHubClientId: () => 'web/test' }));

import { fetchArtifacts } from './apiArtifacts';

describe('apiArtifacts account cancellation', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => [],
        })));
    });

    it('forwards the account AbortSignal to the request', async () => {
        const controller = new AbortController();

        await fetchArtifacts({ token: 'token-a', secret: 'secret-a' }, controller.signal);

        expect(fetch).toHaveBeenCalledWith('https://server.example/v1/artifacts', expect.objectContaining({
            signal: expect.any(AbortSignal),
        }));
    });
});
