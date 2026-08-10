import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CLI AES-GCM Wire adapter boundary', () => {
    it('delegates data-key AES-GCM bytes to the canonical Wire primitive', () => {
        const source = readFileSync(new URL('./encryption.ts', import.meta.url), 'utf8');
        expect(source).toContain('encryptDataKeyBundle');
        expect(source).toContain('decryptDataKeyBundle');
    });
});
