import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const productionFiles = [
    '../persistence.ts',
    '../utils/fileAtomic.ts',
    '../commands/auth.ts',
    '../codex/runCodex.ts',
];

describe('best-effort catch intent', () => {
    it('does not leave empty catches without an intent comment', () => {
        for (const file of productionFiles) {
            const source = readFileSync(resolve(__dirname, file), 'utf8');
            expect(source, file).not.toMatch(/catch\s*\{\s*\}/);
        }
    });
});
