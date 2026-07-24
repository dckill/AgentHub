/**
 * Impression-based prefetch for file contents.
 *
 * Prefetches file content + diff only for the current visible window and a
 * small lookahead, skipping entries already held by the bounded Zustand cache.
 *
 * Prefetch runs with limited concurrency (3 at a time). Moving the window or
 * leaving the screen aborts scheduling and prevents stale cache writes.
 */

import * as React from 'react';
import { sessionExec } from '@/sync/ops';
import { storage } from '@/sync/storage';
import { isFilePreviewCacheEntryFresh } from '@/sync/filePreviewCachePolicy';
import { resolveSessionFilePath } from '@/utils/sessionFileLinks';
import type { GitFileStatus } from '@/sync/gitStatusFiles';
import { classifyFilePreview } from '@/utils/filePreviewPolicy';
import { loadFilePreviewContent } from '@/utils/filePreviewLoader';
import { buildGitFileDiffExec } from '@/utils/gitDiffCommand';
import { getFilePrefetchVersion, runFilePrefetchQueue, selectFilePrefetchWindow, type FilePrefetchRange } from './filePrefetchPolicy';

/**
 * Prefetch a single file's content + diff into the Zustand cache.
 * Silently swallows errors — prefetch is best-effort.
 */
async function prefetchFile(sessionId: string, sessionPath: string, file: GitFileStatus, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    const resolved = resolveSessionFilePath(file.fullPath, sessionPath);
    const filePath = resolved?.absolutePath ?? file.fullPath;
    const gitDiffPath = resolved?.withinSessionRoot ? resolved.relativePath : null;
    const version = getFilePrefetchVersion(file);

    let diff: string | null = null;

    // Fetch git diff
    if (gitDiffPath && gitDiffPath !== '.') {
        try {
            const diffResponse = await sessionExec(sessionId, {
                ...buildGitFileDiffExec(
                    gitDiffPath,
                    file.isStaged ? 'staged' : 'unstaged',
                ),
                cwd: sessionPath,
                timeout: 5000,
            });
            if (diffResponse.success && diffResponse.stdout?.trim()) {
                diff = diffResponse.stdout;
            }
        } catch {
            // Best-effort
        }
    }

    if (signal.aborted) return;
    // Fetch file content
    try {
        const fileName = filePath.split('/').pop() || filePath;
        const loaded = await loadFilePreviewContent({
            source: { kind: 'session', id: sessionId, cwd: sessionPath },
            filePath,
            fileName,
            signal,
        });
        if (signal.aborted || loaded.previewKind === 'image' || loaded.skippedLargeFile) return;
        storage.getState().applyFileCache(
            sessionId,
            filePath,
            loaded.content,
            diff,
            loaded.isBinary,
            loaded.totalSize,
            loaded.truncated,
            version,
        );
    } catch {
        // Best-effort
    }
}

const MAX_CONCURRENCY = 3;

export function usePrefetchFileContents(
    sessionId: string,
    visibleFiles: readonly GitFileStatus[],
    visibleRange: FilePrefetchRange,
) {
    React.useEffect(() => {
        if (visibleFiles.length === 0) return;

        const session = storage.getState().sessions[sessionId];
        const sessionPathMaybe = session?.metadata?.path;
        if (!sessionPathMaybe) return;
        const sessionPath: string = sessionPathMaybe;

        const existingCache = storage.getState().sessionFileCache[sessionId] || {};

        // Collect files that need prefetching: non-deleted, non-binary, not cached
        const filesToPrefetch: GitFileStatus[] = [];
        const allFiles = selectFilePrefetchWindow(visibleFiles, visibleRange);
        const seen = new Set<string>();

        for (const file of allFiles) {
            if (file.status === 'deleted') continue;
            const previewKind = classifyFilePreview(file.fullPath).kind;
            if (previewKind === 'binary' || previewKind === 'image') continue;
            if (seen.has(file.fullPath)) continue;
            seen.add(file.fullPath);

            // Check if already cached by resolving the path the same way file.tsx does
            const resolved = resolveSessionFilePath(file.fullPath, sessionPath);
            const absolutePath = resolved?.absolutePath ?? file.fullPath;
            if (isFilePreviewCacheEntryFresh(existingCache[absolutePath], Date.now(), {
                version: getFilePrefetchVersion(file),
            })) continue;

            filesToPrefetch.push(file);
        }

        if (filesToPrefetch.length === 0) return;

        const controller = new AbortController();

        // Run prefetch with limited concurrency
        void runFilePrefetchQueue(
            filesToPrefetch,
            (file) => prefetchFile(sessionId, sessionPath, file, controller.signal),
            { concurrency: MAX_CONCURRENCY, signal: controller.signal },
        );

        return () => {
            controller.abort();
        };
    }, [sessionId, visibleFiles, visibleRange]);
}
