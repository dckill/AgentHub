import { describe, expect, it } from 'vitest';
import { decodeBase32, encodeBase32, groupBase32 } from './secretKeyBackup';

describe('secret key backup Base32 contract', () => {
    it('keeps the fixed 32-byte vector and five-character grouping stable', () => {
        const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
        const encoded = encodeBase32(bytes);

        expect(encoded).toBe('AAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQTCQKRMFYYDENBWHA5DYPQ');
        expect(groupBase32(encoded)).toBe('AAAQE-AYEAU-DAOCA-JBIFQ-YDIOB-4IBCE-QTCQK-RMFYY-DENBW-HA5DY-PQ');
        expect(decodeBase32(encoded)).toEqual(bytes);
    });

    it('accepts the human-readable separators and common transcription substitutions', () => {
        const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
        const formatted = groupBase32(encodeBase32(bytes));

        expect(decodeBase32(formatted.toLowerCase())).toEqual(bytes);
        expect(decodeBase32(formatted.replace(/O/g, '0').replace(/I/g, '1'))).toEqual(bytes);
    });

    it('rejects an input with no usable Base32 characters', () => {
        expect(() => decodeBase32('---')).toThrow('No valid characters found');
    });
});
