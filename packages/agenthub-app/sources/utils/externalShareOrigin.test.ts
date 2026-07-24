import { describe, expect, it } from 'vitest';
import { resolveExternalShareOrigin } from './externalShareOrigin';

describe('external share origin', () => {
    it('accepts only an undecorated HTTPS origin', () => {
        expect(resolveExternalShareOrigin('https://hub.example.com/')).toBe('https://hub.example.com');
        for (const value of ['', 'http://hub.example.com', 'https://user:pass@hub.example.com', 'https://hub.example.com/share', 'https://hub.example.com?key=x']) {
            expect(resolveExternalShareOrigin(value), value).toBeNull();
        }
    });
});
