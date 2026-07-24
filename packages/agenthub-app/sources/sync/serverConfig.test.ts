import { beforeEach, describe, expect, it, vi } from 'vitest';

const values = new Map<string, string>();

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString(key: string) { return values.get(key); }
        set(key: string, value: string) { values.set(key, value); }
        delete(key: string) { values.delete(key); }
    },
}));

describe('server configuration security policy', () => {
    beforeEach(() => values.clear());

    it('rejects plaintext remote servers but permits loopback development HTTP', async () => {
        const { validateServerUrl } = await import('./serverConfig');

        expect(validateServerUrl('http://example.com:8080').valid).toBe(false);
        expect(validateServerUrl('http://localhost:8080').valid).toBe(true);
        expect(validateServerUrl('http://127.0.0.1:8080').valid).toBe(true);
        expect(validateServerUrl('http://[::1]:8080').valid).toBe(true);
        expect(validateServerUrl('https://example.com').valid).toBe(true);
    });

    it('canonicalizes a committed endpoint to one origin without credentials, path, query, or hash', async () => {
        const { getServerUrl, setServerUrl, validateServerUrl } = await import('./serverConfig');

        expect(validateServerUrl('https://user:pass@example.com').valid).toBe(false);
        expect(validateServerUrl('https://example.com/api?token=x#fragment').valid).toBe(false);

        setServerUrl('  https://example.com:8443/  ');
        expect(getServerUrl()).toBe('https://example.com:8443');
    });
});
