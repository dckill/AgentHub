import { createHash } from 'node:crypto';
import * as privacyKit from 'privacy-kit';

export const PAIRING_REQUEST_TTL_MS = 5 * 60_000;
const POLLING_SECRET_BYTES = 32;

type PairingRecord = {
    id: string;
    publicKey: string;
    pollingSecretHash: string;
    expiresAt: Date;
    consumedAt: Date | null;
    response: string | null;
    responseAccountId: string | null;
};

type PairingDelegate = {
    findUnique(args: unknown): Promise<PairingRecord | null>;
    create(args: unknown): Promise<PairingRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
};

export type PairingPollResult =
    | { state: 'requested'; record: PairingRecord }
    | { state: 'authorized'; record: PairingRecord }
    | { state: 'invalid-secret' }
    | { state: 'gone' };

export function hashPollingSecret(encodedSecret: string): string | null {
    try {
        const secret = privacyKit.decodeBase64(encodedSecret);
        if (secret.length !== POLLING_SECRET_BYTES) return null;
        return createHash('sha256').update(secret).digest('hex');
    } catch {
        return null;
    }
}

export async function createOrPollPairing(
    delegate: PairingDelegate,
    publicKey: string,
    pollingSecretHash: string,
    now = new Date(),
    createData: Record<string, unknown> = {},
): Promise<PairingPollResult> {
    let record = await delegate.findUnique({ where: { publicKey } });
    if (!record) {
        try {
            record = await delegate.create({
                data: {
                    publicKey,
                    pollingSecretHash,
                    expiresAt: new Date(now.getTime() + PAIRING_REQUEST_TTL_MS),
                    ...createData,
                },
            });
        } catch (error) {
            // A concurrent initial request may win the unique publicKey insert.
            record = await delegate.findUnique({ where: { publicKey } });
            if (!record) throw error;
        }
    }
    if (record.pollingSecretHash !== pollingSecretHash) return { state: 'invalid-secret' };
    if (record.consumedAt || record.expiresAt <= now) return { state: 'gone' };
    if (!record.response || !record.responseAccountId) return { state: 'requested', record };

    const claimed = await delegate.updateMany({
        where: {
            id: record.id,
            pollingSecretHash,
            consumedAt: null,
            expiresAt: { gt: now },
            response: { not: null },
            responseAccountId: { not: null },
        },
        data: { consumedAt: now },
    });
    return claimed.count === 1 ? { state: 'authorized', record } : { state: 'gone' };
}

export async function approvePairing(
    delegate: PairingDelegate,
    publicKey: string,
    response: string,
    responseAccountId: string,
    now = new Date(),
): Promise<'approved' | 'not-found' | 'gone' | 'already-approved'> {
    const record = await delegate.findUnique({ where: { publicKey } });
    if (!record) return 'not-found';
    if (record.consumedAt || record.expiresAt <= now) return 'gone';
    if (record.response) return 'already-approved';
    const updated = await delegate.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now }, response: null },
        data: { response, responseAccountId },
    });
    return updated.count === 1 ? 'approved' : 'already-approved';
}
