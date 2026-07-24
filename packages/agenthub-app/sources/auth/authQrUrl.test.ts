import { describe, expect, it } from 'vitest';
import { encodeBase64 } from '@/encryption/base64';
import { parseAuthQrUrl } from './authQrUrl';

describe('parseAuthQrUrl', () => {
    const publicKey = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeBase64(publicKey, 'base64url');

    it('classifies account auth QR URLs', () => {
        expect(parseAuthQrUrl(`agenthub:///account?${encoded}`)).toEqual({
            type: 'account',
            publicKey,
        });
    });

    it('classifies terminal auth QR URLs', () => {
        expect(parseAuthQrUrl(`agenthub://terminal?${encoded}`)).toEqual({
            type: 'terminal',
            publicKey,
        });
    });

    it('rejects unsupported QR URLs', () => {
        expect(parseAuthQrUrl(`https://example.com/account?${encoded}`)).toBeNull();
    });
});
