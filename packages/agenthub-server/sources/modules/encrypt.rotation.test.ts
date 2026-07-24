import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
});

describe('server data-encryption key rotation', () => {
    it('decrypts legacy ciphertext while writing with the new active key', async () => {
        process.env.AGENTHUB_MASTER_SECRET = 'legacy-data-secret-with-at-least-32-bytes';
        const legacy = await import('./encrypt');
        await legacy.initEncrypt();
        const path = ['user', 'u1', 'credentials', 'c1', 'apiKey'];
        const legacyCiphertext = legacy.encryptString(path, 'legacy-value');

        vi.resetModules();
        process.env.AGENTHUB_DATA_ENCRYPTION_KEY_VERSION = '2';
        process.env.AGENTHUB_DATA_ENCRYPTION_KEYS = JSON.stringify({
            1: 'legacy-data-secret-with-at-least-32-bytes',
            2: 'replacement-data-secret-with-at-least-32-bytes',
        });
        const rotated = await import('./encrypt');
        await rotated.initEncrypt();

        expect(rotated.decryptString(path, legacyCiphertext)).toBe('legacy-value');
        const newCiphertext = rotated.encryptString(path, 'new-value');
        expect(rotated.decryptString(path, newCiphertext)).toBe('new-value');

        vi.resetModules();
        delete process.env.AGENTHUB_DATA_ENCRYPTION_KEYS;
        delete process.env.AGENTHUB_DATA_ENCRYPTION_KEY_VERSION;
        const legacyOnly = await import('./encrypt');
        await legacyOnly.initEncrypt();
        expect(() => legacyOnly.decryptString(path, newCiphertext)).toThrow();
    });
});
