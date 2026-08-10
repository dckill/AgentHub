import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('file prefetch account lifecycle boundary', () => {
    it('guards prefetch cache writes by the originating account generation', () => {
        const source = readFileSync(join(__dirname, '..', 'hooks', 'usePrefetchFileContents.ts'), 'utf8');
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('sync.getAccountGeneration() === generation');
        expect(source).toContain('isCurrent: () =>');
        expect(source).toContain('if (signal.aborted || !isCurrent()) return;');
        expect(source).toContain('applyFileCache(');
    });

    it('guards files-screen search results by account generation and query order', () => {
        const source = readFileSync(join(__dirname, '..', 'app/(app)/session/[id]/files.tsx'), 'utf8');
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('sync.getAccountGeneration() === generation');
        expect(source).toContain('searchRequestIdRef');
        expect(source).toContain('if (isCurrent()) setSearchResults(results);');
    });
});
