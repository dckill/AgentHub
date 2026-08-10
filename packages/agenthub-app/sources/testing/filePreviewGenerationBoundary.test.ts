import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('file preview generation boundary', () => {
    it('guards preview and markdown image results by account generation', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', 'components/FilePreviewPanel.tsx'),
            'utf8',
        );

        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () =>');
        expect(source).toContain('if (!isCurrent()) return;');
        expect(source).toContain('if (isCurrent()) setMarkdownImageMap(map);');
    });
});
