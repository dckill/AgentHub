import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
    getRandomBytes: (length: number) => crypto.getRandomValues(new Uint8Array(length)),
}));
vi.mock('@/encryption/libsodium.lib', async () => {
    const { default: sodium } = await import('libsodium-wrappers');
    await sodium.ready;
    return { default: sodium };
});
import {
    buildExternalShareLink,
    consumeExternalShareFragment,
    createEncryptedSelectedTextShare,
    decryptSelectedTextShare,
    parseExternalShareLink,
} from './externalShareCapability';

describe('external E2EE share capability', () => {
    it('uses a fresh 32-byte key and round-trips only the selected text payload', () => {
        const first = createEncryptedSelectedTextShare('explicit selection', 1_721_088_000_000);
        const second = createEncryptedSelectedTextShare('explicit selection', 1_721_088_000_000);
        expect(first.key).toHaveLength(32);
        expect(second.key).toHaveLength(32);
        expect(first.key).not.toEqual(second.key);
        expect(first.ciphertext).not.toEqual(second.ciphertext);
        expect(decryptSelectedTextShare(first.ciphertext, first.key)).toEqual({
            version: 1, scope: 'selected-text', text: 'explicit selection', createdAt: 1_721_088_000_000,
        });
    });

    it('rejects empty or oversized text and fails closed for a wrong key or tampering', () => {
        expect(() => createEncryptedSelectedTextShare('   ')).toThrow();
        expect(() => createEncryptedSelectedTextShare('x'.repeat(64 * 1024))).toThrow();
        const share = createEncryptedSelectedTextShare('secret');
        expect(decryptSelectedTextShare(share.ciphertext, new Uint8Array(32).fill(9))).toBeNull();
        const tampered = share.ciphertext.slice();
        tampered[tampered.length - 1] ^= 1;
        expect(decryptSelectedTextShare(tampered, share.key)).toBeNull();
    });

    it('puts the key only in the fragment of an exact HTTPS share URL', () => {
        const id = '00000000-0000-4000-8000-000000000001';
        const key = new Uint8Array(32).fill(7);
        const link = buildExternalShareLink('https://hub.example.com', id, key);
        const parsed = new URL(link);
        expect(parsed.origin + parsed.pathname).toBe(`https://hub.example.com/share/${id}`);
        expect(parsed.search).toBe('');
        expect(parsed.hash).toMatch(/^#key=[A-Za-z0-9_-]{43}$/);
        expect(parsed.origin + parsed.pathname + parsed.search).not.toContain(parsed.hash.slice(5));
        expect(parseExternalShareLink(link, 'https://hub.example.com')).toEqual({ id, key });
    });

    it('rejects insecure/decorated origins, malformed ids, query keys and foreign origins', () => {
        const id = '00000000-0000-4000-8000-000000000001';
        const key = new Uint8Array(32).fill(7);
        for (const origin of ['http://hub.example.com', 'https://user:pass@hub.example.com', 'https://hub.example.com/app', 'https://hub.example.com?x=1']) {
            expect(() => buildExternalShareLink(origin, id, key), origin).toThrow();
        }
        expect(() => buildExternalShareLink('https://hub.example.com', '../settings', key)).toThrow();
        expect(parseExternalShareLink(`https://hub.example.com/share/${id}?key=secret`, 'https://hub.example.com')).toBeNull();
        expect(parseExternalShareLink(`https://evil.example.com/share/${id}#key=${'A'.repeat(43)}`, 'https://hub.example.com')).toBeNull();
    });

    it('consumes the fragment into memory and synchronously removes it from browser history', () => {
        const id = '00000000-0000-4000-8000-000000000001';
        const key = new Uint8Array(32).fill(7);
        const link = buildExternalShareLink('https://hub.example.com', id, key);
        const replaced: string[] = [];
        expect(consumeExternalShareFragment({
            href: link,
            expectedOrigin: 'https://hub.example.com',
            replaceState: (url) => replaced.push(url),
        })).toEqual({ id, key });
        expect(replaced).toEqual([`https://hub.example.com/share/${id}`]);
        expect(consumeExternalShareFragment({
            href: replaced[0], expectedOrigin: 'https://hub.example.com',
            replaceState: () => { throw new Error('must not rewrite without a key'); },
        })).toBeNull();
    });
});
