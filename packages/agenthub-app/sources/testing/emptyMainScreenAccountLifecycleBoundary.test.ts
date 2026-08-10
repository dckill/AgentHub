import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'components', 'EmptyMainScreen.tsx'), 'utf8');

describe('empty main screen account lifecycle boundary', () => {
    it('guards the manual terminal URL prompt after account changes', () => {
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;');
        expect(source).toContain('connectWithUrl(url.trim());');
    });
});
