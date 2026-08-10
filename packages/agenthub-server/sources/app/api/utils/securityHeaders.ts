export interface SecurityHeaderReply {
    header(name: string, value: string): unknown;
}

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['Referrer-Policy', 'no-referrer'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
    ['Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"],
];

/** Apply headers that are safe for the API and do not depend on deployment TLS termination. */
export function applySecurityHeaders(reply: SecurityHeaderReply): void {
    for (const [name, value] of SECURITY_HEADERS) {
        reply.header(name, value);
    }
}
