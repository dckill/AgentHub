import { describe, expect, it } from 'vitest';
import { parsePatchLines } from './parsePatchLines';

describe('parsePatchLines', () => {
    it('tracks old and new line numbers from unified hunk headers', () => {
        const lines = parsePatchLines([
            '@@ -133,2 +133,4 @@',
            '  sessionGitStatusFiles: {},',
            '+ sessionLastViewedAt: {},',
            '+ sessionUnviewedCompletionAt: {},',
            '  sessionListViewData: null,',
        ].join('\n'));

        expect(lines).toMatchObject([
            { kind: 'hunk' },
            { kind: 'context', oldLineNumber: 133, newLineNumber: 133 },
            { kind: 'add', newLineNumber: 134 },
            { kind: 'add', newLineNumber: 135 },
            { kind: 'context', oldLineNumber: 134, newLineNumber: 136 },
        ]);
        expect(lines[0]).not.toHaveProperty('oldLineNumber');
        expect(lines[0]).not.toHaveProperty('newLineNumber');
        expect(lines[2]).not.toHaveProperty('oldLineNumber');
        expect(lines[3]).not.toHaveProperty('oldLineNumber');
    });

    it('does not count file headers as code lines', () => {
        const lines = parsePatchLines([
            'diff --git a/a.ts b/a.ts',
            '--- a/a.ts',
            '+++ b/a.ts',
            '@@ -10 +10 @@',
            '-old',
            '+new',
        ].join('\n'));

        expect(lines.slice(0, 3).map((line) => line.kind)).toEqual(['file', 'file', 'file']);
        expect(lines[4]).toMatchObject({ kind: 'remove', oldLineNumber: 10 });
        expect(lines[4]).not.toHaveProperty('newLineNumber');
        expect(lines[5]).toMatchObject({ kind: 'add', newLineNumber: 10 });
        expect(lines[5]).not.toHaveProperty('oldLineNumber');
    });
});
