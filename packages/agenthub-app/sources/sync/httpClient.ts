import type { AuthCredentials } from '@/auth/tokenStorage';
import { backoff, HttpStatusError, type BackoffFunc } from '@/utils/time';
import type { ZodType } from 'zod';

const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

function timeoutError(message: string): Error {
    const error = new Error(message);
    error.name = 'TimeoutError';
    return error;
}

export function createAbortScope(callerSignal: AbortSignal | null | undefined, timeoutMs: number) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(timeoutError(`HTTP request timed out after ${timeoutMs}ms`)), timeoutMs);
    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timeout);
            callerSignal?.removeEventListener('abort', abortFromCaller);
        },
    };
}

async function readResponseBody(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    if (typeof response.text === 'function') {
        const text = await response.text();
        if (!text) return undefined;
        try { return JSON.parse(text); } catch { return text; }
    }
    if (typeof response.json === 'function') return response.json();
    return undefined;
}

type HttpClientDependencies = {
    getBaseUrl: () => string;
    getClientId: () => string;
    fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
    retry?: BackoffFunc;
};

type HttpRequestOptions<T> = {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
    schema?: ZodType<T>;
    acceptedStatuses?: number[];
    idempotent?: boolean;
};

function createHttpClientCore(dependencies: HttpClientDependencies) {
    const getBaseUrl = dependencies.getBaseUrl;
    const getClientId = dependencies.getClientId;
    const fetchImpl = dependencies.fetchImpl ?? ((input: string, init: RequestInit) => fetch(input, init));
    const retry = dependencies.retry ?? backoff;

    return {
        async request<T = unknown>(
            credentials: AuthCredentials | null,
            path: string,
            options: HttpRequestOptions<T> = {},
        ): Promise<{ status: number; data: T }> {
            const method = options.method ?? 'GET';
            const canRetry = options.idempotent === true || ['GET', 'HEAD', 'DELETE'].includes(method);
            const execute = async () => {
                const abortScope = createAbortScope(options.signal, options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS);
                try {
                    const response = await fetchImpl(`${getBaseUrl()}${path}`, {
                        method,
                        headers: {
                            ...(credentials ? { Authorization: `Bearer ${credentials.token}` } : {}),
                            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                            'X-AgentHub-Client': getClientId(),
                            ...options.headers,
                        },
                        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
                        signal: abortScope.signal,
                    });
                    const data = await readResponseBody(response);
                    if (!response.ok && !options.acceptedStatuses?.includes(response.status)) {
                        const message = data && typeof data === 'object' && 'error' in data
                            ? String((data as { error: unknown }).error)
                            : `Request failed: ${response.status}`;
                        throw new HttpStatusError(response.status, message);
                    }
                    return {
                        status: response.status,
                        data: (options.schema ? options.schema.parse(data) : data) as T,
                    };
                } finally {
                    abortScope.cleanup();
                }
            };
            return canRetry ? retry(execute) : execute();
        },
    };
}

export function createAuthenticatedHttpClient(dependencies: HttpClientDependencies) {
    const core = createHttpClientCore(dependencies);
    return {
        request: <T = unknown>(credentials: AuthCredentials, path: string, options: HttpRequestOptions<T> = {}) => (
            core.request(credentials, path, options)
        ),
    };
}

export function createPublicHttpClient(dependencies: HttpClientDependencies) {
    const core = createHttpClientCore(dependencies);
    return {
        request: <T = unknown>(path: string, options: HttpRequestOptions<T> = {}) => (
            core.request(null, path, options)
        ),
    };
}
