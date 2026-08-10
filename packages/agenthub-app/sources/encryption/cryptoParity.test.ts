import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
    CryptoDigestAlgorithm: { SHA512: 'sha512' },
    digest: async (_algorithm: string, data: Uint8Array) => new Uint8Array(createHash('sha512').update(data).digest()),
}));
import { deriveKey } from './deriveKey';
import { hmac_sha512 } from './hmac_sha512';

function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

describe('App crypto parity vectors', () => {
    it('matches the shared HMAC-SHA512 vector', async () => {
        const key = new TextEncoder().encode('Jefe');
        const data = new TextEncoder().encode('what do ya want for nothing?');

        expect(hex(await hmac_sha512(key, data))).toBe(
            '164B7A7BFCF819E2E395FBE73B56E0A387BD64222E831FD610270CD7EA2505549758BF75C05A994A6D034F65F8F0E6FDCA EAB1A34D4A6B4B636E070A38BCE737'.replace(' ', ''),
        );
    });

    it('matches the CLI/Agent derivation vector', async () => {
        const key = await deriveKey(new TextEncoder().encode('test seed'), 'test usage', ['child1', 'child2']);

        expect(hex(key)).toBe('1011C097D2105D27362B987A631496BBF68B836124D1D072E9D1613C6028CF75');
    });
});
