import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('encryptor protocol documentation', () => {
    it('documents why batch encryption stays item-by-item', () => {
        const source = fs.readFileSync(path.resolve(__dirname, 'encryptor.ts'), 'utf8');

        expect(source).toContain('wire protocol expects independent ciphertext blocks');
        expect(source).toContain('Do not batch-serialize the entire array');
    });
});
