import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/ops', () => ({
    machineExec: vi.fn(),
}));

import { parseManagedWorktreePath } from './worktree';

describe('parseManagedWorktreePath', () => {
    it('accepts one generated worktree name beneath the managed directory', () => {
        expect(parseManagedWorktreePath('/repo/.dev/worktree/swift-forest-2')).toEqual({
            basePath: '/repo',
            worktreeName: 'swift-forest-2',
        });
    });

    it.each([
        '/repo/.dev/worktree/../outside',
        '/repo/.dev/worktree/name/child',
        '/repo/.dev/worktree/$(touch${IFS}PWNED)',
        '/repo/.dev/worktree/',
        '.dev/worktree/name',
    ])('rejects a path outside the managed single-segment boundary: %s', (path) => {
        expect(parseManagedWorktreePath(path)).toBeNull();
    });
});
