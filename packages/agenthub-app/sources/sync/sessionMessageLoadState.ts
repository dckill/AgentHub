export type SessionMessageLoadError = 'timeout' | 'network';

export function classifySessionMessageLoadError(error: unknown): SessionMessageLoadError | null {
    if (error instanceof Error && error.name === 'AbortError') {
        return null;
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
        return 'timeout';
    }
    return 'network';
}

export function resolveSessionMessagePlaceholder(options: {
    messageCount: number;
    isLoaded: boolean;
    loadError: SessionMessageLoadError | null;
}): 'loading' | 'timeout' | 'network' | 'empty' | null {
    if (options.messageCount > 0) return null;
    if (options.loadError) return options.loadError;
    return options.isLoaded ? 'empty' : 'loading';
}
