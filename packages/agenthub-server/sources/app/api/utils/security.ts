const REDACTED = '[redacted]';

const SENSITIVE_HEADER_NAMES = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-agenthub-debug-secret',
]);

function parseAllowedOrigins() {
    const raw = process.env.AGENTHUB_ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '';
    return raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function isLoopbackOrigin(origin: string) {
    try {
        const url = new URL(origin);
        return url.hostname === 'localhost'
            || url.hostname === '127.0.0.1'
            || url.hostname === '[::1]'
            || url.hostname === '::1';
    } catch {
        return false;
    }
}

export function redactHeaders(headers: Record<string, unknown>) {
    const redacted: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(headers)) {
        redacted[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) ? REDACTED : value;
    }
    return redacted;
}

export function describeAuthHeader(authHeader: unknown) {
    if (typeof authHeader !== 'string' || authHeader.length === 0) {
        return { present: false, scheme: null, length: 0 };
    }

    const [scheme] = authHeader.split(/\s+/, 1);
    return {
        present: true,
        scheme: scheme || null,
        length: authHeader.length,
    };
}

export function isOriginAllowed(origin?: string) {
    if (!origin) {
        return true;
    }

    if (isLoopbackOrigin(origin)) {
        return true;
    }

    const allowedOrigins = parseAllowedOrigins();
    if (allowedOrigins.length === 0) {
        return process.env.NODE_ENV !== 'production';
    }

    return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

export function resolveCorsOrigin(origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) {
    if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
    }

    callback(new Error('Origin not allowed'), false);
}

export function getAllowedOriginsForLog() {
    const allowedOrigins = parseAllowedOrigins();
    if (allowedOrigins.length > 0) {
        return allowedOrigins;
    }
    return process.env.NODE_ENV === 'production' ? ['non-browser requests only'] : ['*'];
}
