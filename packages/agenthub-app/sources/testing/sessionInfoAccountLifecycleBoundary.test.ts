import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const infoSource = readFileSync(join(__dirname, '..', 'app/(app)/session/[id]/info.tsx'), 'utf8');
const cleanupSource = readFileSync(join(__dirname, '..', 'hooks/useWorktreeCleanup.ts'), 'utf8');

describe('Session info account lifecycle boundary', () => {
    it('guards archive/delete actions and worktree cleanup against stale accounts', () => {
        expect(infoSource).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(infoSource).toContain('React.useRef(sync.getAccountGeneration())');
        expect(infoSource).toContain('runSessionActionRequest({');
        expect(infoSource).toContain('if (!isCurrent()) return;');
        expect(infoSource).toContain('isCurrent,');
        expect(cleanupSource).toContain('isCurrent?: () => boolean');
        expect(cleanupSource).toContain('options.isCurrent');
    });
});
