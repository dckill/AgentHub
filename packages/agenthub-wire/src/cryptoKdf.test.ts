import { describe, expect, it } from 'vitest';
import {
    deriveKey,
    deriveSecretKeyTreeChild,
    deriveSecretKeyTreeRoot,
    hmacSha512,
} from './cryptoKdf';

const encoder = new TextEncoder();

describe('shared crypto KDF contract', () => {
    it('matches the RFC 4231 HMAC-SHA512 vector', () => {
        const digest = hmacSha512(
            encoder.encode('Jefe'),
            encoder.encode('what do ya want for nothing?'),
        );

        expect(Buffer.from(digest).toString('hex')).toBe(
            '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
        );
    });

    it('derives root, child, and final keys with stable byte semantics', () => {
        const seed = encoder.encode('shared crypto KDF seed');
        const root = deriveSecretKeyTreeRoot(seed, 'AgentHub compatibility');
        const child = deriveSecretKeyTreeChild(root.chainCode, 'session');
        const final = deriveKey(seed, 'AgentHub compatibility', ['session', 'content']);

        expect(root.key).toHaveLength(32);
        expect(root.chainCode).toHaveLength(32);
        expect(child.key).toHaveLength(32);
        expect(child.chainCode).toHaveLength(32);
        expect(final).toHaveLength(32);
        expect(final).not.toEqual(child.key);
    });
});
