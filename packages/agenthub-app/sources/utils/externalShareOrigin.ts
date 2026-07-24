export function resolveExternalShareOrigin(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        if (
            url.protocol !== 'https:'
            || url.username
            || url.password
            || url.search
            || url.hash
            || (url.pathname !== '/' && url.pathname !== '')
        ) return null;
        return url.origin;
    } catch {
        return null;
    }
}

export function getExternalShareOrigin(): string | null {
    const configured = resolveExternalShareOrigin(process.env.EXPO_PUBLIC_AGENTHUB_SHARE_ORIGIN);
    if (configured) return configured;
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        return resolveExternalShareOrigin(window.location.origin);
    }
    return null;
}
