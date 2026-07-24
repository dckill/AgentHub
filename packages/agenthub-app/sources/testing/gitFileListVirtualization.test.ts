import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GitFileStatus } from '@/sync/gitStatusFiles';
import { buildFileListRowLayouts, buildGitFileListRows } from '@/utils/gitFileListRows';

function createFile(index: number, isStaged: boolean): GitFileStatus {
    return {
        fileName: `file-${index}.ts`,
        filePath: 'src',
        fullPath: `src/file-${index}.ts`,
        status: 'modified',
        isStaged,
        linesAdded: 1,
        linesRemoved: 0,
    };
}

describe('Git file list virtualization boundary', () => {
    it('builds stable section rows and contiguous file indexes for a 10k change set', () => {
        const stagedFiles = Array.from({ length: 5_000 }, (_, index) => createFile(index, true));
        const unstagedFiles = Array.from({ length: 5_000 }, (_, index) => createFile(index + 5_000, false));

        const rows = buildGitFileListRows(stagedFiles, unstagedFiles, true);
        const fileRows = rows.filter((row) => row.kind === 'git-file');

        expect(rows).toHaveLength(10_002);
        expect(rows[0]).toMatchObject({ kind: 'section', source: 'staged', count: 5_000 });
        expect(rows[5_001]).toMatchObject({ kind: 'section', source: 'unstaged', count: 5_000 });
        expect(fileRows).toHaveLength(10_000);
        expect(fileRows[0]).toMatchObject({ source: 'staged', fileIndex: 0, sectionIndex: 0 });
        expect(fileRows[4_999]).toMatchObject({ source: 'staged', fileIndex: 4_999, sectionIndex: 4_999 });
        expect(fileRows[5_000]).toMatchObject({ source: 'unstaged', fileIndex: 5_000, sectionIndex: 0 });
        expect(fileRows[9_999]).toMatchObject({ source: 'unstaged', fileIndex: 9_999, sectionIndex: 4_999 });
        expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);

        const layouts = buildFileListRowLayouts(rows, 1, 1);
        expect(layouts[0]).toEqual({ index: 0, offset: 0, length: 34 });
        expect(layouts[1]).toEqual({ index: 1, offset: 34, length: 77 });
        expect(layouts[5_001]).toEqual({ index: 5_001, offset: 385_034, length: 34 });
        expect(layouts.at(-1)).toEqual({ index: 10_001, offset: 769_991, length: 76 });
        expect(layouts.at(-1)!.offset + layouts.at(-1)!.length).toBe(770_067);
    });

    it('keeps the production route on a virtualized list without full-array JSX maps', () => {
        const routeSource = readFileSync(
            resolve(__dirname, '../app/(app)/session/[id]/files.tsx'),
            'utf8',
        );

        expect(routeSource).toContain('<FlatList');
        expect(routeSource).not.toContain('<ItemList');
        expect(routeSource).not.toMatch(/visible(?:Staged|Unstaged)Files\.map\(/);
        expect(routeSource).not.toMatch(/searchResults\.map\(/);
    });
});
