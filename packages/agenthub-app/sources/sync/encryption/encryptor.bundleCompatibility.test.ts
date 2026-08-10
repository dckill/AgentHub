import { describe, expect, it, vi } from 'vitest';
import { decryptWithDataKey as decryptCliDataKey, encryptWithDataKey as encryptCliDataKey } from '../../../../agenthub-cli/src/api/encryption';
import { DATA_KEY_BUNDLE_VERSION } from '@artsum/agenthub-wire';
import { unwrapDataKeyBundle, wrapDataKeyBundle } from './dataKeyBundle';
import { AES256Encryption } from './encryptor';

vi.hoisted(() => {
    (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;
});

vi.mock('rn-encryption', async () => {
    const { createCipheriv, createDecipheriv, randomBytes } = await import('node:crypto');

    const decodeBase64 = (value: string) => new Uint8Array(Buffer.from(value, 'base64'));
    const encodeBase64 = (value: Uint8Array) => Buffer.from(value).toString('base64');

    return {
        encryptAsyncAES: async (data: string, key: string) => {
            const iv = new Uint8Array(randomBytes(12));
            const cipher = createCipheriv('aes-256-gcm', decodeBase64(key), iv);
            const ciphertext = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
            const combined = Buffer.concat([Buffer.from(iv), ciphertext, cipher.getAuthTag()]);
            return encodeBase64(combined);
        },
        decryptAsyncAES: async (data: string, key: string) => {
            const combined = decodeBase64(data);
            const iv = combined.slice(0, 12);
            const authTag = combined.slice(combined.length - 16);
            const ciphertext = combined.slice(12, combined.length - 16);
            const decipher = createDecipheriv('aes-256-gcm', decodeBase64(key), iv);
            decipher.setAuthTag(authTag);
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        },
    };
});

vi.mock('@more-tech/react-native-libsodium', () => ({ default: {} }));
vi.mock('react-native', () => ({
    Platform: { OS: 'android' },
    TurboModuleRegistry: { getEnforcing: () => ({}) },
}));
vi.mock('expo-crypto', () => ({
    getRandomBytes: (size: number) => new Uint8Array(size),
}));

describe('App data-key bundle boundary', () => {
    it('round-trips the versioned CLI bundle without changing bytes', () => {
        const key = Uint8Array.from({ length: 32 }, (_, index) => index);
        const payload = { sessionId: 'session-1', body: '跨端兼容' };
        const cliBundle = encryptCliDataKey(payload, key);

        const raw = unwrapDataKeyBundle(cliBundle);
        expect(raw).not.toBeNull();
        expect(wrapDataKeyBundle(raw!)).toEqual(cliBundle);
        expect(decryptCliDataKey(wrapDataKeyBundle(raw!), key)).toEqual(payload);
        expect(cliBundle[0]).toBe(DATA_KEY_BUNDLE_VERSION);
    });

    it('rejects truncated or unknown-version bundles before native decryption', () => {
        expect(unwrapDataKeyBundle(new Uint8Array([DATA_KEY_BUNDLE_VERSION]))).toBeNull();
        expect(unwrapDataKeyBundle(Uint8Array.from([99, ...new Uint8Array(40)]))).toBeNull();
    });

    it('keeps the App AES wrapper bidirectionally compatible with CLI bundles', async () => {
        const key = Uint8Array.from({ length: 32 }, (_, index) => index);
        const payload = { sessionId: 'session-1', body: 'App ↔ CLI parity' };
        const appEncryptor = new AES256Encryption(key);

        const [appBundle] = await appEncryptor.encrypt([payload]);
        expect(decryptCliDataKey(appBundle, key)).toEqual(payload);

        const cliBundle = encryptCliDataKey(payload, key);
        await expect(appEncryptor.decrypt([cliBundle])).resolves.toEqual([payload]);
    });
});
