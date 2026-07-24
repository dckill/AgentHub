import { describe, expect, it } from 'vitest';
import { parseStatusSummaryV2 } from './parseStatusV2';

describe('parseStatusSummaryV2', () => {
    it('keeps the destination path authoritative for porcelain v2 rename records', () => {
        const summary = parseStatusSummaryV2([
            '# branch.oid bd95a54cb03513b5c87a175cf5e06c53c49e1e7d',
            '# branch.head master',
            '2 R. N... 100644 100644 100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 R100 staged-new/file-01.ts\ttracked/file-01.ts',
        ].join('\n'));

        expect(summary.files).toEqual([
            expect.objectContaining({
                index: 'R',
                working_dir: '.',
                path: 'staged-new/file-01.ts',
                from: 'tracked/file-01.ts',
                renameScore: 100,
            }),
        ]);
        expect(summary.staged).toEqual(['staged-new/file-01.ts']);
        expect(summary.renamed).toEqual(['staged-new/file-01.ts']);
    });
});
