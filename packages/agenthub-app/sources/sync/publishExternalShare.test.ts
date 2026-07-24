import { describe, expect, it, vi } from 'vitest';

const { encrypt, create } = vi.hoisted(() => ({
    encrypt: vi.fn(() => ({ ciphertext: new Uint8Array([1, 2, 3]), key: new Uint8Array(32).fill(7) })),
    create: vi.fn(async () => ({ id: '00000000-0000-4000-8000-000000000001', scope: 'selected-text', expiresAt: 2, revokedAt: null, createdAt: 1 })),
}));
vi.mock('@/utils/externalShareCapability', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    createEncryptedSelectedTextShare: encrypt,
}));
vi.mock('./externalSharesApi', () => ({ createExternalShare: create }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));

import { publishSelectedTextShare } from './publishExternalShare';

describe('publishSelectedTextShare', () => {
    it('keeps the key client-side and returns a fragment capability link', async () => {
        const credentials = { token: 'token', secret: 'root-secret' };
        const result = await publishSelectedTextShare({
            credentials,
            text: 'selected',
            expiresInSeconds: 86_400,
            origin: 'https://hub.example.com',
            id: '00000000-0000-4000-8000-000000000001',
        });
        expect(create).toHaveBeenCalledWith(credentials, {
            id: '00000000-0000-4000-8000-000000000001',
            ciphertext: new Uint8Array([1, 2, 3]),
            expiresInSeconds: 86_400,
        }, undefined);
        expect(JSON.stringify((create.mock.calls as any)[0][1])).not.toContain('root-secret');
        expect(result.link).toMatch(/^https:\/\/hub\.example\.com\/share\/.+#key=/);
    });
});
