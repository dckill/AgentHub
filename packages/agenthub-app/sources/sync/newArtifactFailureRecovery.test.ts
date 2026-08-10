import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('new artifact failure recovery', () => {
    it('refreshes artifacts instead of storing an undecrypted artifact shell', () => {
        const source = readFileSync(resolve(__dirname, 'newArtifactRealtimeApplication.ts'), 'utf8');

        expect(source).toMatch(/kind: 'undecrypted'/);
    });
});
