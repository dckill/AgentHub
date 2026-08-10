import { db } from '@/storage/db';

/** Remove retained ciphertext while preserving share metadata for audit/history. */
export async function clearExpiredExternalShareCiphertexts(now = new Date()): Promise<void> {
    await db.externalShare.updateMany({
        where: {
            OR: [
                { expiresAt: { lte: now } },
                { revokedAt: { not: null } },
            ],
            ciphertext: { not: Buffer.alloc(0) },
        },
        data: { ciphertext: Buffer.alloc(0) },
    });
}
