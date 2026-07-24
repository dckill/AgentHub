import { AuthCredentials } from '@/auth/tokenStorage';
import { Artifact, ArtifactCreateRequest, ArtifactUpdateRequest, ArtifactUpdateResponse } from './artifactTypes';
import { httpClient } from './authenticatedHttpClient';
import { HttpStatusError } from '@/utils/time';

/**
 * Fetch all artifacts for the account
 */
export async function fetchArtifacts(credentials: AuthCredentials, signal?: AbortSignal): Promise<Artifact[]> {
    return (await httpClient.request<Artifact[]>(credentials, '/v1/artifacts', { signal })).data;
}

/**
 * Fetch a single artifact with full body
 */
export async function fetchArtifact(credentials: AuthCredentials, artifactId: string, signal?: AbortSignal): Promise<Artifact> {
    try {
        return (await httpClient.request<Artifact>(credentials, `/v1/artifacts/${artifactId}`, { signal })).data;
    } catch (error) {
        if (error instanceof HttpStatusError && error.status === 404) throw new Error('Artifact not found');
        throw error;
    }
}

/**
 * Create a new artifact
 */
export async function createArtifact(
    credentials: AuthCredentials, 
    request: ArtifactCreateRequest,
    signal?: AbortSignal,
): Promise<Artifact> {
    try {
        return (await httpClient.request<Artifact>(credentials, '/v1/artifacts', {
            method: 'POST',
            signal,
            body: request,
        })).data;
    } catch (error) {
        if (error instanceof HttpStatusError && error.status === 409) throw new Error('Artifact ID already exists');
        throw error;
    }
}

/**
 * Update an existing artifact
 */
export async function updateArtifact(
    credentials: AuthCredentials,
    artifactId: string,
    request: ArtifactUpdateRequest,
    signal?: AbortSignal,
): Promise<ArtifactUpdateResponse> {
    try {
        return (await httpClient.request<ArtifactUpdateResponse>(credentials, `/v1/artifacts/${artifactId}`, {
            method: 'POST',
            signal,
            body: request,
        })).data;
    } catch (error) {
        if (error instanceof HttpStatusError && error.status === 404) throw new Error('Artifact not found');
        throw error;
    }
}

/**
 * Delete an artifact
 */
export async function deleteArtifact(
    credentials: AuthCredentials,
    artifactId: string,
    signal?: AbortSignal,
): Promise<void> {
    try {
        await httpClient.request(credentials, `/v1/artifacts/${artifactId}`, {
            method: 'DELETE',
            signal,
        });
    } catch (error) {
        if (error instanceof HttpStatusError && error.status === 404) throw new Error('Artifact not found');
        throw error;
    }
}
