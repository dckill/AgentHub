import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'app/(app)/session/[id]/git-log.tsx'), 'utf8');

describe('git log account generation boundary', () => {
    it('drops stale graph results after an account or session lifecycle change', () => {
        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;');
        expect(source).toContain('runSessionActionRequest({');
        expect(source).toContain('getGitGraph(sessionId!, cwd, 120)');
    });
});
