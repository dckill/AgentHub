import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    describeAuthHeader,
    getAllowedOriginsForLog,
    isOriginAllowed,
    redactHeaders,
    resolveCorsOrigin,
} from './security';

describe('security utils', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('redacts sensitive headers case-insensitively', () => {
        expect(redactHeaders({
            authorization: 'Bearer secret',
            Cookie: 'sid=secret',
            'x-api-key': 'secret',
            accept: 'application/json',
        })).toEqual({
            authorization: '[redacted]',
            Cookie: '[redacted]',
            'x-api-key': '[redacted]',
            accept: 'application/json',
        });
    });

    it('describes auth headers without leaking credentials', () => {
        expect(describeAuthHeader('Bearer abcdef')).toEqual({ present: true, scheme: 'Bearer', length: 13 });
        expect(describeAuthHeader('Basic abcdef')).toEqual({ present: true, scheme: 'Basic', length: 12 });
        expect(describeAuthHeader('custom-token')).toEqual({ present: true, scheme: 'custom-token', length: 12 });
        expect(describeAuthHeader(undefined)).toEqual({ present: false, scheme: null, length: 0 });
    });

    it('allows configured origins and defaults to permissive non-production mode without an allowlist', () => {
        vi.stubEnv('AGENTHUB_ALLOWED_ORIGINS', 'https://app.example.com, https://admin.example.com');

        expect(isOriginAllowed(undefined)).toBe(true);
        expect(isOriginAllowed('https://app.example.com')).toBe(true);
        expect(isOriginAllowed('http://localhost:19007')).toBe(true);
        expect(isOriginAllowed('http://127.0.0.1:8081')).toBe(true);
        expect(isOriginAllowed('http://localhost:3000')).toBe(true);
        expect(isOriginAllowed('https://evil.example.com')).toBe(false);
        expect(getAllowedOriginsForLog()).toContain('https://admin.example.com');

        vi.stubEnv('AGENTHUB_ALLOWED_ORIGINS', '');
        vi.stubEnv('NODE_ENV', 'test');
        expect(isOriginAllowed('https://any.example.com')).toBe(true);
    });

    it('resolves CORS callbacks using the allowlist', () => {
        vi.stubEnv('AGENTHUB_ALLOWED_ORIGINS', 'https://app.example.com');
        const callback = vi.fn();

        resolveCorsOrigin('https://evil.example.com', callback);

        expect(callback).toHaveBeenCalledWith(expect.any(Error), false);
    });
});
