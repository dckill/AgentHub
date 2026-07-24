import { AuthCredentials } from '@/auth/tokenStorage';
import { httpClient } from './authenticatedHttpClient';

//
// Types
//

export interface KvItem {
    key: string;
    value: string;
    version: number;
}

export interface KvListParams {
    prefix?: string;
    limit?: number;
}

export interface KvListResponse {
    items: KvItem[];
}

export interface KvBulkGetRequest {
    keys: string[];
}

export interface KvBulkGetResponse {
    values: KvItem[];
}

export interface KvMutation {
    key: string;
    value: string | null;  // null to delete
    version: number;       // -1 for new keys
}

export interface KvMutateRequest {
    mutations: KvMutation[];
}

export interface KvMutateSuccessResponse {
    success: true;
    results: Array<{
        key: string;
        version: number;
    }>;
}

export interface KvMutateErrorResponse {
    success: false;
    errors: Array<{
        key: string;
        error: 'version-mismatch';
        version: number;
        value: string | null;
    }>;
}

export type KvMutateResponse = KvMutateSuccessResponse | KvMutateErrorResponse;

//
// API Functions
//

/**
 * Get a single value by key
 */
export async function kvGet(
    credentials: AuthCredentials,
    key: string,
    signal?: AbortSignal,
): Promise<KvItem | null> {
    const response = await httpClient.request<KvItem | { missing?: boolean }>(credentials, `/v1/kv/${encodeURIComponent(key)}`, {
            signal,
            acceptedStatuses: [404],
        });
    return response.status === 404 ? null : response.data as KvItem;
}

/**
 * List key-value pairs with optional prefix filter
 */
export async function kvList(
    credentials: AuthCredentials,
    params: KvListParams = {},
    signal?: AbortSignal,
): Promise<KvListResponse> {
    const queryParams = new URLSearchParams();
    if (params.prefix) {
        queryParams.append('prefix', params.prefix);
    }
    if (params.limit !== undefined) {
        queryParams.append('limit', params.limit.toString());
    }

    const path = queryParams.toString() ? `/v1/kv?${queryParams.toString()}` : '/v1/kv';
    const response = await httpClient.request<KvListResponse>(credentials, path, { signal });
    return response.data;
}

/**
 * Get multiple values by keys (up to 100)
 */
export async function kvBulkGet(
    credentials: AuthCredentials,
    keys: string[],
    signal?: AbortSignal,
): Promise<KvBulkGetResponse> {
    if (keys.length === 0) {
        return { values: [] };
    }

    if (keys.length > 100) {
        throw new Error('Cannot bulk get more than 100 keys at once');
    }

    const response = await httpClient.request<KvBulkGetResponse>(credentials, '/v1/kv/bulk', {
            method: 'POST',
            body: { keys },
            signal,
            idempotent: true,
        });
    return response.data;
}

/**
 * Atomically mutate multiple key-value pairs
 * Supports create, update, and delete operations
 * Uses optimistic concurrency control with version numbers
 */
export async function kvMutate(
    credentials: AuthCredentials,
    mutations: KvMutation[],
    signal?: AbortSignal,
): Promise<KvMutateResponse> {
    if (mutations.length === 0) {
        return { success: true, results: [] };
    }

    if (mutations.length > 100) {
        throw new Error('Cannot mutate more than 100 keys at once');
    }

    const response = await httpClient.request<KvMutateResponse>(credentials, '/v1/kv', {
            method: 'POST',
            body: { mutations },
            signal,
            acceptedStatuses: [409],
        });
    return response.data;
}

//
// Helper Functions
//

/**
 * Set a single key-value pair
 * Creates new key if version is -1, updates existing if version matches
 */
export async function kvSet(
    credentials: AuthCredentials,
    key: string,
    value: string,
    version: number = -1
): Promise<number> {
    const result = await kvMutate(credentials, [{
        key,
        value,
        version
    }]);

    if (result.success === false) {
        const error = result.errors[0];
        throw new Error(`Failed to set key "${key}": ${error.error} (current version: ${error.version})`);
    }

    return result.results[0].version;
}

/**
 * Delete a single key
 */
export async function kvDelete(
    credentials: AuthCredentials,
    key: string,
    version: number
): Promise<void> {
    const result = await kvMutate(credentials, [{
        key,
        value: null,
        version
    }]);

    if (result.success === false) {
        const error = result.errors[0];
        throw new Error(`Failed to delete key "${key}": ${error.error} (current version: ${error.version})`);
    }
}

/**
 * Get keys with a specific prefix
 */
export async function kvGetByPrefix(
    credentials: AuthCredentials,
    prefix: string,
    limit: number = 100
): Promise<KvItem[]> {
    const response = await kvList(credentials, { prefix, limit });
    return response.items;
}
