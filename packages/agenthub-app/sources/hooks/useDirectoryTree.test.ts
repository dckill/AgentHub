import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { act, create } = require('react-test-renderer') as {
    act: (callback: () => Promise<void> | void) => Promise<void>;
    create: (element: React.ReactElement) => { unmount: () => void };
};

const mockSource = {
    getDirectoryTree: vi.fn(),
    listDirectory: vi.fn(),
    isMethodAvailable: vi.fn(),
};

vi.mock('@/utils/directoryTreeSource', () => ({
    createDirectoryTreeSource: vi.fn(() => mockSource),
    getDirectoryBrowserRootPath: vi.fn(() => '/repo'),
}));

import { useDirectoryTree } from './useDirectoryTree';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flushEffects = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('useDirectoryTree RPC presence gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSource.getDirectoryTree.mockResolvedValue({
            success: true,
            tree: { name: 'repo', path: '/repo', type: 'directory', children: [] },
        });
        mockSource.listDirectory.mockResolvedValue({ success: true, entries: [] });
        mockSource.isMethodAvailable.mockResolvedValue(false);
    });

    it('does not call getDirectoryTree when the session RPC handler is not online', async () => {
        let latest: ReturnType<typeof useDirectoryTree> | null = null;

        function Harness() {
            latest = useDirectoryTree({ kind: 'session', sessionId: 'session-1' }, '/repo');
            return null;
        }
        let renderer: { unmount: () => void } | null = null;

        await act(async () => {
            renderer = create(React.createElement(Harness));
            await flushEffects();
        });

        expect(mockSource.isMethodAvailable).toHaveBeenCalledWith('getDirectoryTree');
        expect(mockSource.getDirectoryTree).not.toHaveBeenCalled();
        expect((latest as any)?.error).toBe('Session connection is not ready yet. Try again after it reconnects.');
        await act(async () => {
            renderer?.unmount();
        });
    });
});
