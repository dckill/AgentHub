import { describe, expect, it, vi } from 'vitest';

const updateMany = vi.hoisted(() => vi.fn());
vi.mock('@/storage/db', () => ({
    db: { externalShare: { updateMany } },
}));

import { clearExpiredExternalShareCiphertexts } from '@/app/maintenance/externalShareCleanup';

describe('external share ciphertext cleanup', () => {
    it('clears ciphertext for expired or revoked rows without deleting metadata', async () => {
        const now = new Date('2026-07-16T00:00:00.000Z');

        await clearExpiredExternalShareCiphertexts(now);

        expect(updateMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { expiresAt: { lte: now } },
                    { revokedAt: { not: null } },
                ],
                ciphertext: { not: Buffer.alloc(0) },
            },
            data: { ciphertext: Buffer.alloc(0) },
        });
    });
});
