import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionRipgrep } = vi.hoisted(() => ({
    sessionRipgrep: vi.fn(),
}));

vi.mock('./ops', () => ({ sessionRipgrep }));

import { fileSearchCache, loadAllFiles, searchFiles } from './suggestionFile';

describe('suggestionFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fileSearchCache.clearCache();
    });

    it('builds file and folder entries from ripgrep output', async () => {
        sessionRipgrep.mockResolvedValueOnce({
            success: true,
            stdout: 'src/app/index.ts\nsrc/components/Button.tsx\nREADME.md\n',
        });

        const results = await searchFiles('session-1', '', { limit: 10 });

        expect(sessionRipgrep).toHaveBeenCalledWith('session-1', ['--files', '--follow'], undefined);
        expect(results).toEqual(expect.arrayContaining([
            { fileName: 'index.ts', filePath: 'src/app/', fullPath: 'src/app/index.ts', fileType: 'file' },
            { fileName: 'Button.tsx', filePath: 'src/components/', fullPath: 'src/components/Button.tsx', fileType: 'file' },
            { fileName: 'src/', filePath: '', fullPath: 'src/', fileType: 'folder' },
            { fileName: 'app/', filePath: 'src/', fullPath: 'src/app/', fileType: 'folder' },
        ]));
    });

    it('reuses cache for repeated searches in a session', async () => {
        sessionRipgrep.mockResolvedValueOnce({ success: true, stdout: 'src/app/index.ts\n' });

        await searchFiles('session-1', 'index');
        await searchFiles('session-1', 'src');

        expect(sessionRipgrep).toHaveBeenCalledTimes(1);
    });

    it('keeps caches isolated per session and clearable', async () => {
        sessionRipgrep
            .mockResolvedValueOnce({ success: true, stdout: 'a.ts\n' })
            .mockResolvedValueOnce({ success: true, stdout: 'b.ts\n' })
            .mockResolvedValueOnce({ success: true, stdout: 'c.ts\n' });

        await searchFiles('s1', 'a');
        await searchFiles('s2', 'b');
        fileSearchCache.clearCache('s1');
        await searchFiles('s1', 'c');

        expect(sessionRipgrep).toHaveBeenCalledTimes(3);
    });

    it('returns empty results when ripgrep fails', async () => {
        sessionRipgrep.mockResolvedValueOnce({ success: false, stdout: '' });

        await expect(searchFiles('session-1', 'anything')).resolves.toEqual([]);
    });

    it('loads complete file cache for directory browsing even when many files share one prefix', async () => {
        const appFiles = Array.from({ length: 2100 }, (_, index) =>
            `artifacts/AgentHubPreview.app/Contents/file-${index}.txt`
        );
        sessionRipgrep.mockResolvedValueOnce({
            success: true,
            stdout: [...appFiles, 'packages/agenthub-app/package.json'].join('\n') + '\n',
        });

        const allFiles = await loadAllFiles('session-1');
        const rootFolders = allFiles
            .filter(item => item.fileType === 'folder' && item.filePath === '')
            .map(item => item.fullPath);

        expect(rootFolders).toEqual(expect.arrayContaining([
            'artifacts/',
            'packages/',
        ]));
    });
});
