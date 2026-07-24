import { describe, expect, it } from 'vitest';

import {
    buildAuthenticatedSessionLink,
    parseAuthenticatedSessionLink,
} from './authenticatedDeepLinks';

describe('authenticated HTTPS session links', () => {
    const sessionId = 'cmrn45nnm00028a9jdjh0v1qf';

    it('builds an HTTPS link with only the opaque session id', () => {
        expect(buildAuthenticatedSessionLink('https://hub.example.com', sessionId))
            .toBe(`https://hub.example.com/session/${sessionId}`);
        expect(buildAuthenticatedSessionLink('https://hub.example.com:8443/', sessionId))
            .toBe(`https://hub.example.com:8443/session/${sessionId}`);
    });

    it('rejects insecure, credentialed or decorated base URLs', () => {
        for (const baseUrl of [
            'http://hub.example.com',
            'https://user:password@hub.example.com',
            'https://hub.example.com/app',
            'https://hub.example.com?token=secret',
            'https://hub.example.com/#key=secret',
        ]) {
            expect(() => buildAuthenticatedSessionLink(baseUrl, sessionId), baseUrl).toThrow();
        }
    });

    it('rejects ids that can escape or smuggle URL material', () => {
        for (const id of ['', '../settings', 'short', 'session/id', 'id?token=secret', 'id#key=secret', '%2Fsettings']) {
            expect(() => buildAuthenticatedSessionLink('https://hub.example.com', id), id).toThrow();
        }
    });

    it('parses only the exact expected origin and route without query or fragment material', () => {
        const valid = `https://hub.example.com/session/${sessionId}`;
        expect(parseAuthenticatedSessionLink(valid, 'https://hub.example.com')).toEqual({ sessionId });

        for (const url of [
            `http://hub.example.com/session/${sessionId}`,
            `https://evil.example.com/session/${sessionId}`,
            `https://hub.example.com/session/${sessionId}?token=secret`,
            `https://hub.example.com/session/${sessionId}#key=secret`,
            `https://hub.example.com/session/${sessionId}/files`,
            'https://hub.example.com/session/%2E%2E%2Fsettings',
        ]) {
            expect(parseAuthenticatedSessionLink(url, 'https://hub.example.com'), url).toBeNull();
        }
    });
});
