import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/ops', () => ({
    machineGetDirectoryTree: vi.fn(),
    machineListDirectory: vi.fn(),
    machineRPCAvailable: vi.fn(),
    sessionGetDirectoryTree: vi.fn(),
    sessionListDirectory: vi.fn(),
    sessionRPCAvailable: vi.fn(),
}));

import { createDirectoryTreeSource, getDirectoryBrowserRootPath } from './directoryTreeSource';

describe('directory tree source', () => {
    it('uses machine directory RPCs for device file browsing without a session id', async () => {
        const deps = {
            machineGetDirectoryTree: vi.fn().mockResolvedValue({ success: true, tree: { name: '/', path: '/', type: 'directory', children: [] } }),
            machineListDirectory: vi.fn().mockResolvedValue({ success: true, entries: [] }),
            machineRPCAvailable: vi.fn().mockResolvedValue(true),
            sessionGetDirectoryTree: vi.fn(),
            sessionListDirectory: vi.fn(),
            sessionRPCAvailable: vi.fn(),
        };

        const source = createDirectoryTreeSource({ kind: 'machine', machineId: 'machine-1' }, deps);

        await source.getDirectoryTree('/', 1);
        await source.listDirectory('/var');

        expect(deps.machineGetDirectoryTree).toHaveBeenCalledWith('machine-1', '/', 1);
        expect(deps.machineListDirectory).toHaveBeenCalledWith('machine-1', '/var');
        expect(deps.sessionGetDirectoryTree).not.toHaveBeenCalled();
        expect(deps.sessionListDirectory).not.toHaveBeenCalled();
    });

    it('keeps session directory browsing on session RPCs', async () => {
        const deps = {
            machineGetDirectoryTree: vi.fn(),
            machineListDirectory: vi.fn(),
            machineRPCAvailable: vi.fn(),
            sessionGetDirectoryTree: vi.fn().mockResolvedValue({ success: true, tree: { name: 'repo', path: '/repo', type: 'directory', children: [] } }),
            sessionListDirectory: vi.fn().mockResolvedValue({ success: true, entries: [] }),
            sessionRPCAvailable: vi.fn().mockResolvedValue(false),
        };

        const source = createDirectoryTreeSource({ kind: 'session', sessionId: 'session-1' }, deps);

        await source.getDirectoryTree('/repo', 1);
        await source.listDirectory('/repo/src');

        expect(deps.sessionGetDirectoryTree).toHaveBeenCalledWith('session-1', '/repo', 1);
        expect(deps.sessionListDirectory).toHaveBeenCalledWith('session-1', '/repo/src');
        expect(deps.machineGetDirectoryTree).not.toHaveBeenCalled();
        expect(deps.machineListDirectory).not.toHaveBeenCalled();
    });

    it('checks session RPC presence before browsing project files', async () => {
        const deps = {
            machineGetDirectoryTree: vi.fn(),
            machineListDirectory: vi.fn(),
            machineRPCAvailable: vi.fn(),
            sessionGetDirectoryTree: vi.fn(),
            sessionListDirectory: vi.fn(),
            sessionRPCAvailable: vi.fn().mockResolvedValue(false),
        };

        const source = createDirectoryTreeSource({ kind: 'session', sessionId: 'session-1' }, deps);

        await expect(source.isMethodAvailable('getDirectoryTree')).resolves.toBe(false);

        expect(deps.sessionRPCAvailable).toHaveBeenCalledWith('session-1', 'getDirectoryTree');
    });

    it('defaults machine browsing to filesystem root while preserving session roots', () => {
        expect(getDirectoryBrowserRootPath({ kind: 'machine', machineId: 'machine-1' })).toBe('/');
        expect(getDirectoryBrowserRootPath({ kind: 'machine', machineId: 'machine-1' }, null)).toBeNull();
        expect(getDirectoryBrowserRootPath({ kind: 'session', sessionId: 'session-1' }, '/repo')).toBe('/repo');
        expect(getDirectoryBrowserRootPath({ kind: 'session', sessionId: 'session-1' }, null)).toBeNull();
    });
});
