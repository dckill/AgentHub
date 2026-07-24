function runtimeIsOnline(): boolean {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
        return navigator.onLine;
    }
    return true;
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

function isNetworkTransportError(error: unknown): boolean {
    if (error instanceof TypeError) return true;
    if (!(error instanceof Error)) return false;
    return error.name === 'NetworkError'
        || /failed to fetch|network request failed|load failed/i.test(error.message);
}

export function shouldReportSyncError(error: unknown, online = runtimeIsOnline()): boolean {
    if (isAbortError(error)) return false;
    return online || !isNetworkTransportError(error);
}
