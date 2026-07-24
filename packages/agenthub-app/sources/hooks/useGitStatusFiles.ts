/**
 * Stale-while-revalidate hook for git status files.
 *
 * On first visit (no cache): shows isLoading=true while fetching.
 * On subsequent visits (e.g. returning from file view): renders cached data
 * instantly from the Zustand store, refreshes silently in the background.
 * The component only re-renders if the fetched data actually differs from cache.
 */

import * as React from 'react';
import { useFocusEffect } from 'expo-router';
import { getGitStatusFiles, GitStatusFiles } from '@/sync/gitStatusFiles';
import { storage, useSession, useSessionGitStatusFiles } from '@/sync/storage';
import { classifyGitStatusLoadResult } from '@/hooks/gitStatusLoadState';

export function useGitStatusFiles(sessionId: string) {
    const cached = useSessionGitStatusFiles(sessionId);
    const session = useSession(sessionId);
    const [isFetching, setIsFetching] = React.useState(false);
    const [hasError, setHasError] = React.useState(false);
    const lastRefreshKeyRef = React.useRef<string | null>(null);
    const cachedState = classifyGitStatusLoadResult(cached);

    const refresh = React.useCallback(async () => {
        setIsFetching(true);
        setHasError(false);
        try {
            const result = await getGitStatusFiles(sessionId);
            const resultState = classifyGitStatusLoadResult(result);
            if (resultState.kind === 'ready') {
                storage.getState().applyGitStatusFiles(sessionId, resultState.data);
            } else if (resultState.kind === 'not-repo') {
                storage.getState().applyGitStatusFiles(sessionId, null);
            } else {
                setHasError(true);
            }
        } catch (error) {
            console.error('Failed to load git status files:', error);
            setHasError(true);
        } finally {
            setIsFetching(false);
        }
    }, [sessionId]);

    // Refresh on mount and every time the screen is focused
    useFocusEffect(
        React.useCallback(() => {
            refresh();
        }, [refresh])
    );

    // Web direct-entry fallback: some routes can mount already focused without
    // firing a focus transition, so ensure we fetch once per session on mount.
    React.useEffect(() => {
        const refreshKey = `${sessionId}:${session?.metadata?.path ?? 'no-path'}:${cached ? 'cached' : 'empty'}`;
        if (lastRefreshKeyRef.current === refreshKey) {
            return;
        }
        lastRefreshKeyRef.current = refreshKey;
        void refresh();
    }, [sessionId, session?.metadata?.path, cached, refresh]);

    return {
        data: cachedState.kind === 'ready' ? cachedState.data : null,
        // Only show loading spinner when there's no cached data yet
        isLoading: cachedState.kind !== 'ready' && isFetching,
        error: hasError || cachedState.kind === 'error',
        refresh,
    };
}
