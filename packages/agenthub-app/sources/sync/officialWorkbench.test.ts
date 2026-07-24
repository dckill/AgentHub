import { describe, expect, it, vi } from 'vitest';
import {
    getOfficialThreadWorkbenchId,
    ignoreOfficialThreadsFromWorkbench,
    removeOfficialThreadsFromList,
} from './officialWorkbench';
import type { OfficialCodexThread } from './officialThreads';

function thread(overrides: Partial<OfficialCodexThread>): OfficialCodexThread {
    return {
        id: 'thread-1',
        machineId: 'machine-1',
        cwd: '/repo',
        title: 'Thread',
        updatedAt: 10,
        archived: false,
        ...overrides,
    };
}

describe('official workbench helpers', () => {
    it('uses provider-qualified ids for Claude and raw ids for Codex', () => {
        expect(getOfficialThreadWorkbenchId(thread({ id: 'codex-thread', provider: 'codex' }))).toBe('codex-thread');
        expect(getOfficialThreadWorkbenchId(thread({ id: 'claude-session', provider: 'claude' }))).toBe('claude:claude-session');
    });

    it('removes matching official threads from a local list', () => {
        expect(removeOfficialThreadsFromList([
            thread({ id: 'codex-1', provider: 'codex' }),
            thread({ id: 'claude-1', provider: 'claude' }),
            thread({ id: 'codex-2', provider: 'codex' }),
        ], ['codex-1', 'claude:claude-1'])).toEqual([
            thread({ id: 'codex-2', provider: 'codex' }),
        ]);
    });

    it('applies the local removal before the remote ignore call resolves', async () => {
        let resolveIgnore: () => void = () => {};
        const ignoreThread = vi.fn(() => new Promise<void>((resolve) => {
            resolveIgnore = resolve;
        }));
        const applyThreads = vi.fn();
        const threads = [
            thread({ id: 'codex-1', provider: 'codex' }),
            thread({ id: 'codex-2', provider: 'codex' }),
        ];

        const promise = ignoreOfficialThreadsFromWorkbench({
            machineId: 'machine-1',
            officialIds: ['codex-1'],
            getThreads: () => threads,
            applyThreads,
            ignoreThread,
        });

        expect(applyThreads).toHaveBeenCalledWith('machine-1', [
            thread({ id: 'codex-2', provider: 'codex' }),
        ]);
        expect(ignoreThread).toHaveBeenCalledWith('machine-1', 'codex-1');

        resolveIgnore();
        await promise;
    });

    it('restores the previous local list when the remote ignore call fails', async () => {
        const applyThreads = vi.fn();
        const threads = [
            thread({ id: 'codex-1', provider: 'codex' }),
            thread({ id: 'codex-2', provider: 'codex' }),
        ];

        await expect(ignoreOfficialThreadsFromWorkbench({
            machineId: 'machine-1',
            officialIds: ['codex-1'],
            getThreads: () => threads,
            applyThreads,
            ignoreThread: vi.fn(async () => {
                throw new Error('RPC failed');
            }),
        })).rejects.toThrow('RPC failed');

        expect(applyThreads).toHaveBeenNthCalledWith(1, 'machine-1', [
            thread({ id: 'codex-2', provider: 'codex' }),
        ]);
        expect(applyThreads).toHaveBeenNthCalledWith(2, 'machine-1', threads);
    });
});
