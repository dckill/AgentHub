import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    sessions: {
        s1: { id: 's1', metadata: { machineId: 'machine-a', path: '/repo-a' } },
    } as Record<string, any>,
    applyGitStatus: vi.fn(),
}));
const sessionExec = vi.hoisted(() => vi.fn());

vi.mock('./storage', () => ({
    storage: { getState: () => state },
}));
vi.mock('./ops', () => ({ sessionExec }));
vi.mock('./projectManager', () => ({
    createProjectKey: (machineId: string, path: string) => `${machineId}:${path}`,
    projectManager: { updateProjectGitStatus: vi.fn() },
}));

import { GitStatusSync } from './gitStatusSync';

describe('GitStatusSync account lifecycle', () => {
    it('does not commit account A git status after reset and account B reuse', async () => {
        let resolveGitCheck!: (value: any) => void;
        sessionExec
            .mockImplementationOnce(() => new Promise(resolve => { resolveGitCheck = resolve; }))
            .mockResolvedValue({ success: true, exitCode: 0, stdout: '' });
        const sync = new GitStatusSync();

        sync.getSync('s1').invalidate();
        await vi.waitFor(() => expect(sessionExec).toHaveBeenCalledTimes(1));
        sync.resetAll();
        state.sessions.s1 = { id: 's1', metadata: { machineId: 'machine-b', path: '/repo-b' } };
        resolveGitCheck({ success: true, exitCode: 0, stdout: 'true' });
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(state.applyGitStatus).not.toHaveBeenCalled();
    });
});
