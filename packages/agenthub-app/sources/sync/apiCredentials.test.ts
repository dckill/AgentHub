import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getServerUrl, getAgentHubClientId, backoff } = vi.hoisted(() => ({
    getServerUrl: vi.fn(() => 'https://server.test'),
    getAgentHubClientId: vi.fn(() => 'web/1.0.0'),
    backoff: vi.fn((callback: () => Promise<unknown>) => callback()),
}));

vi.mock('./serverConfig', () => ({ getServerUrl }));
vi.mock('./apiSocket', () => ({ getAgentHubClientId }));
vi.mock('@/utils/time', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/utils/time')>(),
    backoff,
}));

import {
    createCredential,
    deleteCredential,
    getCredential,
    getCredentialEnvVars,
    listCredentials,
    updateCredential,
} from './apiCredentials';

const credentials = { token: 'token-1', secret: 'secret-1' };

function mockJsonResponse(status: number, body: unknown) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    } as Response);
}

describe('apiCredentials', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('lists credentials with auth and client headers', async () => {
        vi.mocked(fetch).mockReturnValueOnce(mockJsonResponse(200, { credentials: [{ id: 'cred-1' }] }) as any);

        await expect(listCredentials(credentials)).resolves.toEqual([{ id: 'cred-1' }]);

        expect(fetch).toHaveBeenCalledWith('https://server.test/v1/credentials', expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
                Authorization: 'Bearer token-1',
                'X-AgentHub-Client': 'web/1.0.0',
            }),
            signal: expect.any(AbortSignal),
        }));
    });

    it('sends create and update bodies as JSON', async () => {
        vi.mocked(fetch)
            .mockReturnValueOnce(mockJsonResponse(200, { credential: { id: 'created' } }) as any)
            .mockReturnValueOnce(mockJsonResponse(200, { credential: { id: 'updated' } }) as any);

        await createCredential(credentials, { label: 'Claude', agent: 'claude', apiKey: 'key', baseUrl: 'https://api.test' });
        await updateCredential(credentials, 'cred-1', { label: 'New label', baseUrl: null });

        expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
            method: 'POST',
            body: JSON.stringify({ label: 'Claude', agent: 'claude', apiKey: 'key', baseUrl: 'https://api.test' }),
        });
        expect(fetch).toHaveBeenLastCalledWith('https://server.test/v1/credentials/cred-1', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ label: 'New label', baseUrl: null }),
        }));
    });

    it('does not attach a request body for delete', async () => {
        vi.mocked(fetch).mockReturnValueOnce(mockJsonResponse(200, {}) as any);

        await deleteCredential(credentials, 'cred-1');

        expect(fetch).toHaveBeenCalledWith('https://server.test/v1/credentials/cred-1', expect.not.objectContaining({ body: expect.anything() }));
    });

    it('encodes env-var context query parameters', async () => {
        vi.mocked(fetch).mockReturnValueOnce(mockJsonResponse(200, { envVars: { ANTHROPIC_AUTH_TOKEN: 'key' } }) as any);

        await expect(getCredentialEnvVars(credentials, 'cred-1', { machineId: 'machine one', sessionId: 'session/1' })).resolves.toEqual({
            ANTHROPIC_AUTH_TOKEN: 'key',
        });

        expect(fetch).toHaveBeenCalledWith(
            'https://server.test/v1/credentials/cred-1/env-vars?machineId=machine+one&sessionId=session%2F1',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('throws server error messages when requests fail', async () => {
        vi.mocked(fetch).mockReturnValueOnce(mockJsonResponse(400, { error: 'Unsupported model override: BAD' }) as any);

        await expect(getCredential(credentials, 'bad')).rejects.toThrow('Unsupported model override: BAD');
    });
});
