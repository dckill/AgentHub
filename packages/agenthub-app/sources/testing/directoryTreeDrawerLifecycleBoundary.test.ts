import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(sources, relativePath), 'utf8');

describe('directory tree drawer lifecycle boundary', () => {
    it('guards remote file deletion across account generation changes', () => {
        const drawer = read('components/DirectoryTreeDrawer.tsx');

        expect(drawer).toContain("import { sync } from '@/sync/sync';");
        expect(drawer).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(drawer).toContain('const generation = sync.getAccountGeneration();');
        expect(drawer).toContain('runSessionActionRequest({');
    });
});
