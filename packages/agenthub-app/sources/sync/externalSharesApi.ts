import { z } from 'zod';
import type { AuthCredentials } from '@/auth/tokenStorage';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { httpClient } from './authenticatedHttpClient';
import { publicHttpClient } from './publicHttpClient';

const shareIdSchema = z.string().uuid();
const metadataSchema = z.object({
    id: shareIdSchema,
    scope: z.literal('selected-text'),
    expiresAt: z.number().int().nonnegative(),
    revokedAt: z.number().int().nonnegative().nullable(),
    createdAt: z.number().int().nonnegative(),
}).strict();
const publicShareSchema = z.object({
    id: shareIdSchema,
    ciphertext: z.string().min(1),
    scope: z.literal('selected-text'),
    expiresAt: z.number().int().nonnegative(),
}).strict();

export type ExternalShareMetadata = z.infer<typeof metadataSchema>;
export type PublicExternalShare = Omit<z.infer<typeof publicShareSchema>, 'ciphertext'> & { ciphertext: Uint8Array };

export async function createExternalShare(
    credentials: AuthCredentials,
    input: { id: string; ciphertext: Uint8Array; expiresInSeconds: 3_600 | 86_400 | 604_800 },
    signal?: AbortSignal,
): Promise<ExternalShareMetadata> {
    const id = shareIdSchema.parse(input.id);
    const response = await httpClient.request(credentials, '/v1/external-shares', {
        method: 'POST',
        idempotent: true,
        signal,
        body: {
            id,
            ciphertext: encodeBase64(input.ciphertext),
            scope: 'selected-text',
            expiresInSeconds: input.expiresInSeconds,
        },
        schema: metadataSchema,
    });
    return response.data;
}

export async function listExternalShares(
    credentials: AuthCredentials,
    signal?: AbortSignal,
): Promise<ExternalShareMetadata[]> {
    const response = await httpClient.request(credentials, '/v1/external-shares', {
        method: 'GET', signal, schema: z.array(metadataSchema),
    });
    return response.data;
}

export async function revokeExternalShare(
    credentials: AuthCredentials,
    id: string,
    signal?: AbortSignal,
): Promise<ExternalShareMetadata> {
    const safeId = shareIdSchema.parse(id);
    const response = await httpClient.request(credentials, `/v1/external-shares/${encodeURIComponent(safeId)}`, {
        method: 'DELETE', signal, schema: metadataSchema,
    });
    return response.data;
}

export async function getPublicExternalShare(
    id: string,
    signal?: AbortSignal,
): Promise<PublicExternalShare> {
    const safeId = shareIdSchema.parse(id);
    const response = await publicHttpClient.request(`/v1/public-shares/${encodeURIComponent(safeId)}`, {
        method: 'GET', signal, schema: publicShareSchema,
    });
    return { ...response.data, ciphertext: decodeBase64(response.data.ciphertext) };
}
