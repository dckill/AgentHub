import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticatedRequest, publicRequest } = vi.hoisted(() => ({
    authenticatedRequest: vi.fn(),
    publicRequest: vi.fn(),
}));

vi.mock('./authenticatedHttpClient', () => ({ httpClient: { request: authenticatedRequest } }));
vi.mock('./publicHttpClient', () => ({ publicHttpClient: { request: publicRequest } }));

import {
    createExternalShare,
    getPublicExternalShare,
    listExternalShares,
    revokeExternalShare,
} from './externalSharesApi';

const credentials = { token: 'token', secret: 'memory-only-root-secret' };
const id = '00000000-0000-4000-8000-000000000001';

describe('external shares API', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uploads only ciphertext through the authenticated idempotent client with AbortSignal', async () => {
        const signal = new AbortController().signal;
        authenticatedRequest.mockResolvedValue({ data: {
            id, scope: 'selected-text', expiresAt: 2, revokedAt: null, createdAt: 1,
        } });
        await createExternalShare(credentials, {
            id, ciphertext: new Uint8Array([1, 2, 3]), expiresInSeconds: 86_400,
        }, signal);

        expect(authenticatedRequest).toHaveBeenCalledWith(credentials, '/v1/external-shares', expect.objectContaining({
            method: 'POST', idempotent: true, signal,
            body: { id, ciphertext: 'AQID', scope: 'selected-text', expiresInSeconds: 86_400 },
        }));
        expect(JSON.stringify(authenticatedRequest.mock.calls[0][2].body)).not.toContain(credentials.secret);
    });

    it('lists and revokes through authenticated bounded requests', async () => {
        authenticatedRequest.mockResolvedValue({ data: [] });
        await listExternalShares(credentials);
        expect(authenticatedRequest).toHaveBeenCalledWith(credentials, '/v1/external-shares', expect.objectContaining({ method: 'GET' }));

        authenticatedRequest.mockResolvedValue({ data: { id, scope: 'selected-text', expiresAt: 2, revokedAt: 3, createdAt: 1 } });
        await revokeExternalShare(credentials, id);
        expect(authenticatedRequest).toHaveBeenCalledWith(credentials, `/v1/external-shares/${id}`, expect.objectContaining({ method: 'DELETE' }));
    });

    it('fetches public ciphertext without credentials and decodes it only after schema validation', async () => {
        publicRequest.mockResolvedValue({ data: { id, ciphertext: 'AQID', scope: 'selected-text', expiresAt: 2 } });
        await expect(getPublicExternalShare(id)).resolves.toEqual({
            id, ciphertext: new Uint8Array([1, 2, 3]), scope: 'selected-text', expiresAt: 2,
        });
        expect(publicRequest).toHaveBeenCalledWith(`/v1/public-shares/${id}`, expect.objectContaining({ method: 'GET' }));
        expect(publicRequest.mock.calls[0]).not.toContain(credentials);
    });
});
