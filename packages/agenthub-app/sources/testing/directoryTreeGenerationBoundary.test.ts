import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sources = path.resolve(__dirname, '..');

describe('directory tree generation boundary', () => {
    it('guards initial, lazy and manual directory requests by account generation', () => {
        const hook = fs.readFileSync(path.join(sources, 'hooks/useDirectoryTree.ts'), 'utf8');

        expect(hook).toContain("import { sync } from '@/sync/sync';");
        expect(hook).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(hook).toContain('const generation = sync.getAccountGeneration();');
        expect(hook).toContain('runSessionActionRequest({');
        expect(hook).toContain('sync.getAccountGeneration() === generation');
    });
});
