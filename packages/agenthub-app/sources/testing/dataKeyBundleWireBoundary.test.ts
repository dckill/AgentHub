import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'sync/encryption/dataKeyBundle.ts'),
    'utf8',
);

describe('App data-key bundle Wire boundary', () => {
    it('delegates versioned AES-GCM packing and validation to the shared Wire contract', () => {
        expect(source).toContain('packDataKeyBundle');
        expect(source).toContain('unpackDataKeyBundle');
        expect(source).toContain('DATA_KEY_NONCE_BYTES');
        expect(source).toContain('DATA_KEY_AUTH_TAG_BYTES');
    });
});
