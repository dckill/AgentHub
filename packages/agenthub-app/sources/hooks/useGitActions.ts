/**
 * Hook that wraps git write operations with confirmation dialogs,
 * success/error feedback, and automatic state refresh.
 *
 * Uses a single action executor (similar to useAgentHubAction) that supports
 * parameterized actions for file-level operations.
 */

import * as React from 'react';
import { Modal } from '@/modal';
import { t } from '@/text';
import { storage } from '@/sync/storage';
import { gitStatusSync } from '@/sync/gitStatusSync';
import { getGitStatusFiles } from '@/sync/gitStatusFiles';
import { AgentHubError } from '@/utils/errors';
import { GitFileStatus } from '@/sync/gitStatusFiles';
import * as gitOps from '@/utils/gitOperations';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { sync } from '@/sync/sync';

function getCwd(sessionId: string): string | null {
    const session = storage.getState().sessions[sessionId];
    return session?.metadata?.path ?? null;
}

function throwGitError(error: string): never {
    throw new AgentHubError(error, false);
}

async function invalidateAndRefresh(sessionId: string, isCurrent: () => boolean = () => true) {
    if (!isCurrent()) return;
    gitStatusSync.invalidate(sessionId);
    const result = await getGitStatusFiles(sessionId);
    if (!isCurrent()) return;
    storage.getState().applyGitStatusFiles(sessionId, result);
}

async function runGitRequest<T>({
    isCurrent,
    request,
}: {
    isCurrent: () => boolean;
    request: () => Promise<T>;
}): Promise<T | null> {
    try {
        return await runSessionActionRequest({ isCurrent, request });
    } catch (error) {
        if (!isCurrent()) return null;
        throw error;
    }
}

export function useGitActions(sessionId: string) {
    const [loading, setLoading] = React.useState(false);
    const loadingRef = React.useRef(false);

    const runAction = React.useCallback(async (action: () => Promise<void>) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        try {
            await action();
        } catch (e) {
            if (e instanceof AgentHubError) {
                Modal.alert(t('common.error'), e.message, [{ text: t('common.ok'), style: 'cancel' }]);
            } else {
                Modal.alert(t('common.error'), t('common.unknownError'), [{ text: t('common.ok'), style: 'cancel' }]);
            }
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, []);

    const discardFile = React.useCallback((file: GitFileStatus) => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const confirmed = await runGitRequest({
                isCurrent,
                request: () => Modal.confirm(
                    t('common.delete'),
                    t('gitActions.discardFile', { fileName: file.fileName }),
                    {
                        confirmText: t('gitActions.discard'),
                        cancelText: t('common.cancel'),
                        destructive: true,
                    }
                ),
            });
            if (confirmed !== true) return;

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.discardFileChanges(
                    sessionId, cwd, file.fullPath, file.isStaged, file.status
                ),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.discarded'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const discardAll = React.useCallback(() => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const confirmed = await runGitRequest({
                isCurrent,
                request: () => Modal.confirm(
                    t('gitActions.discardAll'),
                    t('gitActions.discardAllMessage'),
                    {
                        confirmText: t('gitActions.discardAll'),
                        cancelText: t('common.cancel'),
                        destructive: true,
                    }
                ),
            });
            if (confirmed !== true) return;

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.discardAllChanges(sessionId, cwd),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.discarded'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const stageFileAction = React.useCallback((file: GitFileStatus) => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.stageFile(sessionId, cwd, file.fullPath),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.staged'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const unstageFileAction = React.useCallback((file: GitFileStatus) => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.unstageFile(sessionId, cwd, file.fullPath),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.unstaged'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const commitAction = React.useCallback(() => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const message = await runGitRequest({
                isCurrent,
                request: () => Modal.prompt(
                    t('gitActions.commitTitle'),
                    t('gitActions.commitMessage'),
                    { placeholder: t('gitActions.commitPlaceholder') }
                ),
            });
            if (message === null) return;
            if (!message.trim()) {
                throwGitError(t('gitActions.commitEmptyMessage'));
            }

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.commitChanges(sessionId, cwd, message.trim()),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.committed'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const stashSaveAction = React.useCallback(() => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const message = await runGitRequest({
                isCurrent,
                request: () => Modal.prompt(
                    t('gitActions.stashTitle'),
                    t('gitActions.stashMessage'),
                    { placeholder: t('gitActions.stashPlaceholder') }
                ),
            });
            if (message === null) return;

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.stashSave(sessionId, cwd, message || undefined),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.stashed'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const stashPopAction = React.useCallback(() => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const confirmed = await runGitRequest({
                isCurrent,
                request: () => Modal.confirm(
                    t('gitActions.stashPopTitle'),
                    t('gitActions.stashPopMessage'),
                    {
                        confirmText: t('gitActions.stashPop'),
                        cancelText: t('common.cancel'),
                    }
                ),
            });
            if (confirmed !== true) return;

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.stashPop(sessionId, cwd),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.stashPopped'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const pushAction = React.useCallback(() => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const confirmed = await runGitRequest({
                isCurrent,
                request: () => Modal.confirm(
                    t('gitActions.pushTitle'),
                    t('gitActions.pushMessage'),
                    {
                        confirmText: t('gitActions.push'),
                        cancelText: t('common.cancel'),
                    }
                ),
            });
            if (confirmed !== true) return;

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.pushChanges(sessionId, cwd),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.pushed'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const pullAction = React.useCallback(() => {
        runAction(async () => {
            const generation = sync.getAccountGeneration();
            const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
            if (!isCurrent()) return;
            const cwd = getCwd(sessionId);
            if (!cwd) return;

            const confirmed = await runGitRequest({
                isCurrent,
                request: () => Modal.confirm(
                    t('gitActions.pullTitle'),
                    t('gitActions.pullMessage'),
                    {
                        confirmText: t('gitActions.pull'),
                        cancelText: t('common.cancel'),
                    }
                ),
            });
            if (confirmed !== true) return;

            const result = await runGitRequest({
                isCurrent,
                request: () => gitOps.pullChanges(sessionId, cwd),
            });
            if (result === null || !isCurrent()) return;
            if (!result.success) throwGitError(result.error!);
            Modal.alert(t('gitActions.pulled'));
            await invalidateAndRefresh(sessionId, isCurrent);
        });
    }, [sessionId, runAction]);

    const refreshFiles = React.useCallback(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        await invalidateAndRefresh(sessionId, isCurrent);
    }, [sessionId]);

    return {
        discardFile,
        discardAll,
        stageFile: stageFileAction,
        unstageFile: unstageFileAction,
        commit: commitAction,
        stashSave: stashSaveAction,
        stashPop: stashPopAction,
        push: pushAction,
        pull: pullAction,
        loading,
        refreshFiles,
    };
}
