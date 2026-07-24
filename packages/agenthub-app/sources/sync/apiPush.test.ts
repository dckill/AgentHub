import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./serverConfig', () => ({ getServerUrl: () => 'https://server.example' }));
vi.mock('./apiSocket', () => ({ getAgentHubClientId: () => 'web/test' }));

import { registerPushToken } from './apiPush';

describe('apiPush account cancellation', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: true }),
        })));
    });

    it('forwards AbortSignal to push registration', async () => {
        const controller = new AbortController();
        await registerPushToken({ token: 'token-a', secret: 'secret-a' }, 'push-a', controller.signal);

        expect(fetch).toHaveBeenCalledWith('https://server.example/v1/push-tokens', expect.objectContaining({
            signal: expect.any(AbortSignal),
        }));
    });
});
