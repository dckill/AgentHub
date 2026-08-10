import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/ops', () => ({
    machineExec: vi.fn(),
}));

import { machineExec } from '@/sync/ops';
import { listWorktrees, parseManagedWorktreePath } from './worktree';

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

describe('listWorktrees', () => {
    it('surfaces machine/RPC failures instead of treating them as an empty list', async () => {
        vi.mocked(machineExec).mockResolvedValueOnce({
            success: false,
            exitCode: -1,
            stderr: 'connection refused',
        } as never);

        await expect(listWorktrees('machine-1', '/repo')).rejects.toThrow('connection refused');
    });
});
