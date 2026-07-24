import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcesRoot = resolve(__dirname, '..');

describe('Web search payload boundary', () => {
    it('loads Fuse only when fuzzy command or file search is initialized', () => {
        const commandSearch = readFileSync(resolve(sourcesRoot, 'sync/suggestionCommands.ts'), 'utf8');
        const fileSearch = readFileSync(resolve(sourcesRoot, 'sync/suggestionFile.ts'), 'utf8');

        for (const source of [commandSearch, fileSearch]) {
            expect(source).not.toMatch(/^import Fuse from ['"]fuse\.js['"];?$/m);
            expect(source).toContain("import('fuse.js')");
        }
    });
});
