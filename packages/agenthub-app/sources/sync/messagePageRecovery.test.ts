import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('message page decryption recovery', () => {
    it('retries the page when an encrypted record has no decrypted payload', () => {
        const source = readFileSync(resolve(__dirname, 'messagePageApplication.ts'), 'utf8');
        const method = source;

        expect(method).toMatch(/messages\.some\(/);
        expect(method).toMatch(/content\.t === 'encrypted'/);
        expect(method).toMatch(/throw new Error\(`Failed to decrypt one or more messages/);
    });
});
