import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('file preview request lifecycle', () => {
    it('does not restart the file request when the cache write rerenders the screen', () => {
        const source = fs.readFileSync(
            path.resolve(process.cwd(), 'sources/app/(app)/session/[id]/file.tsx'),
            'utf8',
        );
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('sync.getAccountGeneration() === generation');
        const effect = source.match(
            /\/\/ Load file content[\s\S]*?React\.useEffect\(\(\) => \{[\s\S]*?\n    \}, \[([^\]]+)\]\);/,
        );

        expect(effect, 'file preview loading effect should be discoverable').not.toBeNull();
        const dependencies = effect?.[1].split(',').map((dependency) => dependency.trim()) ?? [];
        expect(dependencies).not.toContain('cached');
        expect(dependencies).toEqual(expect.arrayContaining([
            'diffSourceParam',
            'filePath',
            'sessionId',
            'sessionPath',
            'statusParam',
        ]));
    });
});
