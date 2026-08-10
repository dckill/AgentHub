import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'app/(app)/artifacts/index.tsx'), 'utf8');

describe('Artifact list account generation boundary', () => {
    it('does not apply loading completion from an obsolete account request', () => {
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('runSessionActionRequest({');
        expect(source).toContain('if (!cancelled && isCurrent())');
    });
});
