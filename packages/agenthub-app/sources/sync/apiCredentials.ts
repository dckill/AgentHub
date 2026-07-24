import { AuthCredentials } from '@/auth/tokenStorage';
import type { ClientAgent, SupportedClientAgent } from './agentTypes';
import { httpClient } from './authenticatedHttpClient';

export interface ManagedCredential {
    id: string;
    label: string;
    agent: ClientAgent;
    hasApiKey: boolean;
    baseUrl: string | null;
    modelOverrides: Record<string, string> | null;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateCredentialInput {
    label: string;
    agent: SupportedClientAgent;
    apiKey: string;
    baseUrl?: string;
    modelOverrides?: Record<string, string>;
}

export interface UpdateCredentialInput {
    label?: string;
    apiKey?: string;
    baseUrl?: string | null;
    modelOverrides?: Record<string, string> | null;
}

async function credentialRequest(
    credentials: AuthCredentials,
    method: string,
    path: string,
    body?: any,
    signal?: AbortSignal,
): Promise<any> {
    const response = await httpClient.request(credentials, path, {
        method: method as 'GET' | 'POST' | 'DELETE',
        body,
        signal,
    });
    return response.data;
}

/** List all managed credentials for the current user */
export async function listCredentials(credentials: AuthCredentials, signal?: AbortSignal): Promise<ManagedCredential[]> {
    const data = await credentialRequest(credentials, 'GET', '/v1/credentials', undefined, signal) as { credentials: ManagedCredential[] };
    return data.credentials;
}

/** Get a single credential by ID */
export async function getCredential(credentials: AuthCredentials, id: string, signal?: AbortSignal): Promise<ManagedCredential> {
    const data = await credentialRequest(credentials, 'GET', `/v1/credentials/${id}`, undefined, signal) as { credential: ManagedCredential };
    return data.credential;
}

/** Create a new credential */
export async function createCredential(credentials: AuthCredentials, input: CreateCredentialInput, signal?: AbortSignal): Promise<ManagedCredential> {
    const data = await credentialRequest(credentials, 'POST', '/v1/credentials', input, signal) as { credential: ManagedCredential };
    return data.credential;
}

/** Update an existing credential */
export async function updateCredential(credentials: AuthCredentials, id: string, input: UpdateCredentialInput, signal?: AbortSignal): Promise<ManagedCredential> {
    const data = await credentialRequest(credentials, 'POST', `/v1/credentials/${id}`, input, signal) as { credential: ManagedCredential };
    return data.credential;
}

/** Delete a credential */
export async function deleteCredential(credentials: AuthCredentials, id: string, signal?: AbortSignal): Promise<void> {
    await credentialRequest(credentials, 'DELETE', `/v1/credentials/${id}`, undefined, signal);
}

/** Get credential resolved as environment variables for session spawning */
export async function getCredentialEnvVars(credentials: AuthCredentials, id: string, context?: { machineId?: string; sessionId?: string }, signal?: AbortSignal): Promise<Record<string, string>> {
    const params = new URLSearchParams();
    if (context?.machineId) params.set('machineId', context.machineId);
    if (context?.sessionId) params.set('sessionId', context.sessionId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const data = await credentialRequest(credentials, 'GET', `/v1/credentials/${id}/env-vars${suffix}`, undefined, signal) as { envVars: Record<string, string> };
    return data.envVars;
}
