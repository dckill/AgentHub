import { createAbortScope } from './httpClient';
import { parseNativeUpdateResponse, type NativeUpdateStatus } from './nativeUpdateResponse';

type NativePlatform = 'android' | 'ios';

type NativeUpdateRequest = {
    signal: AbortSignal;
};

export type NativeUpdateRequestParams = {
    request: NativeUpdateRequest;
    serverUrl: string;
    platform: NativePlatform;
    version: string;
    appId: string;
    clientId: string;
    fetchImpl?: typeof fetch;
    warn?: (message: string) => void;
};

/** Fetch and parse the platform update status while bounding the request lifetime. */
export async function fetchNativeUpdateStatus(params: NativeUpdateRequestParams): Promise<NativeUpdateStatus | null> {
    const fetchImpl = params.fetchImpl ?? fetch;
    const warn = params.warn ?? console.warn;
    const abortScope = createAbortScope(params.request.signal, 15_000);
    try {
        const response = await fetchImpl(`${params.serverUrl}/v1/version`, {
            method: 'POST',
            signal: abortScope.signal,
            headers: {
                'Content-Type': 'application/json',
                'X-AgentHub-Client': params.clientId,
            },
            body: JSON.stringify({
                platform: params.platform,
                version: params.version,
                app_id: params.appId,
            }),
        });
        if (!response.ok) {
            warn(`[fetchNativeUpdate] Request failed: ${response.status}`);
            return null;
        }
        return parseNativeUpdateResponse(await response.json());
    } finally {
        abortScope.cleanup();
    }
}
