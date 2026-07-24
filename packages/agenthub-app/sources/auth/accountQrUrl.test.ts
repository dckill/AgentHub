import { describe, expect, it } from 'vitest';
import { encodeBase64 } from '@/encryption/base64';
import { parseAccountQrUrl } from './accountQrUrl';

describe('parseAccountQrUrl', () => {
    const publicKey = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeBase64(publicKey, 'base64url');

    it('accepts account QR URLs emitted by the web restore screen', () => {
        expect(parseAccountQrUrl(`agenthub:///account?${encoded}`)).toEqual(publicKey);
    });

    it('accepts scanner-normalized account QR URL slash variants', () => {
        expect(parseAccountQrUrl(`agenthub:/account?${encoded}`)).toEqual(publicKey);
        expect(parseAccountQrUrl(`agenthub://account?${encoded}`)).toEqual(publicKey);
    });

    it('rejects non-account QR URLs', () => {
        expect(parseAccountQrUrl(`agenthub:///terminal?${encoded}`)).toBeNull();
        expect(parseAccountQrUrl(`https://example.com/account?${encoded}`)).toBeNull();
    });
});
