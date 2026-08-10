import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'hooks/useEnsureSessionLoaded.ts'), 'utf8');

describe('Ensure session loaded account lifecycle boundary', () => {
    it('binds session loading and loading-state cleanup to the account generation', () => {
        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('request: () => sync.ensureSessionLoaded(sessionId!)');
        expect(source).toContain('if (result === null || !isCurrent()) return;');
        expect(source).toContain('if (!isCurrent()) return;');
    });
});
