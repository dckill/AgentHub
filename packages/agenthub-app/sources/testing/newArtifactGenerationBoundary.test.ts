import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'app/(app)/artifacts/new.tsx'), 'utf8');

describe('New artifact account generation boundary', () => {
    it('does not navigate or surface stale create results after account changes', () => {
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('runSessionActionRequest({');
        expect(source).toContain('if (!isCurrent()) return;');
    });
});
