const OPAQUE_RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

function parseTrustedHttpsBaseUrl(value: string): URL {
    const url = new URL(value);
    if (
        url.protocol !== 'https:'
        || url.username
        || url.password
        || url.search
        || url.hash
        || (url.pathname !== '/' && url.pathname !== '')
    ) {
        throw new Error('Authenticated deep-link base URL must be an undecorated HTTPS origin');
    }
    return url;
}

function requireOpaqueResourceId(value: string): string {
    if (!OPAQUE_RESOURCE_ID.test(value)) {
        throw new Error('Authenticated deep-link resource id is invalid');
    }
    return value;
}

export function buildAuthenticatedSessionLink(baseUrl: string, sessionId: string): string {
    const base = parseTrustedHttpsBaseUrl(baseUrl);
    const safeSessionId = requireOpaqueResourceId(sessionId);
    return `${base.origin}/session/${encodeURIComponent(safeSessionId)}`;
}

export function parseAuthenticatedSessionLink(
    value: string,
    expectedBaseUrl: string,
): { sessionId: string } | null {
    try {
        const expected = parseTrustedHttpsBaseUrl(expectedBaseUrl);
        const candidate = new URL(value);
        if (
            candidate.protocol !== 'https:'
            || candidate.origin !== expected.origin
            || candidate.username
            || candidate.password
            || candidate.search
            || candidate.hash
        ) {
            return null;
        }

        const match = candidate.pathname.match(/^\/session\/([^/]+)$/);
        if (!match) {
            return null;
        }
        const sessionId = decodeURIComponent(match[1]);
        return { sessionId: requireOpaqueResourceId(sessionId) };
    } catch {
        return null;
    }
}
