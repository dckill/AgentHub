import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'app/(app)/machine/[id].tsx'), 'utf8');

describe('Machine detail account generation boundary', () => {
    it('guards daemon, CLI, rename and delete actions against stale account results', () => {
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('runSessionActionRequest({');
        expect(source).toContain('if (!isCurrent()) return;');
    });
});
