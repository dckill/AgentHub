import { AuthCredentials } from '@/auth/tokenStorage';
import { z } from 'zod';
import { httpClient } from './authenticatedHttpClient';

const PushTokenSchema = z.object({
    id: z.string(),
    token: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
});

const PushTokenListResponseSchema = z.object({
    tokens: z.array(PushTokenSchema),
});
const SuccessResponseSchema = z.object({ success: z.literal(true) });

export type PushToken = z.infer<typeof PushTokenSchema>;

export async function registerPushToken(credentials: AuthCredentials, token: string, signal?: AbortSignal): Promise<void> {
    await httpClient.request(credentials, '/v1/push-tokens', {
            method: 'POST',
            signal,
            body: { token },
            schema: SuccessResponseSchema,
    });
}

export async function fetchPushTokens(credentials: AuthCredentials, signal?: AbortSignal): Promise<PushToken[]> {
    const response = await httpClient.request(credentials, '/v1/push-tokens', {
            method: 'GET',
            signal,
            schema: PushTokenListResponseSchema,
    });
    return response.data.tokens;
}

export async function unregisterPushToken(credentials: AuthCredentials, token: string, signal?: AbortSignal): Promise<void> {
    await httpClient.request(credentials, `/v1/push-tokens/${encodeURIComponent(token)}`, {
            method: 'DELETE',
            signal,
            schema: SuccessResponseSchema,
    });
}
