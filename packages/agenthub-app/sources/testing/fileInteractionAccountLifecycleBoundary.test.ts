import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(join(__dirname, '..', 'components', name), 'utf8');

describe('file interaction account lifecycle boundary', () => {
    it('drops stale git status results before storage projection', () => {
        const source = read('FilesSidebar.tsx');
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('sync.getAccountGeneration() === generation');
        expect(source).toContain('applyGitStatusFiles(sessionId, result);');
    });

    it('drops stale inline diff responses before content, error, or loading projection', () => {
        const source = read('InlineFileDiff.tsx');
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('sync.getAccountGeneration() === generation');
        expect(source).toContain('if (!isCurrent()) return;');
    });

    it('binds initial and debounced file-reference searches to account generation and request order', () => {
        const source = read('FileReferencePicker.tsx');
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('sync.getAccountGeneration() === generation');
        expect(source).toContain('searchRequestIdRef');
        expect(source).toContain('clearTimeout(searchTimeoutRef.current)');
    });
});
