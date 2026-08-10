/**
 * Hook for merging a worktree branch back into the main repo via a new Claude Code session.
 *
 * Instead of running git merge directly, this creates a new session on the main repo path
 * and sends a merge instruction so Claude Code can handle conflicts intelligently.
 *
 * After sending the merge instruction, the user is asked whether to archive the original
 * worktree session and clean up the worktree files. Choosing "no" leaves everything as-is.
 */

import * as React from 'react';
import { useAgentHubAction } from '@/hooks/useAgentHubAction';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { machineSpawnNewSession, sessionKill, sessionArchive } from '@/sync/ops';
import { sync } from '@/sync/sync';
import { storage } from '@/sync/storage';
import { Modal } from '@/modal';
import { t } from '@/text';
import { AgentHubError } from '@/utils/errors';
import { isWorktreePath, getRepoPath, getWorktreeName, removeWorktree } from '@/utils/worktree';
import { Session } from '@/sync/storageTypes';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { runWorktreeMergePostSpawnLifecycle } from '@/sync/worktreeMergeLifecycle';

export function useWorktreeMerge(session: Session) {
    const navigateToSession = useNavigateToSession();
    const sessionPath = session.metadata?.path;
    const machineId = session.metadata?.machineId;
    const canMerge = !!(sessionPath && machineId && isWorktreePath(sessionPath));

    const [mergingWorktree, performMerge] = useAgentHubAction(async () => {
        if (!sessionPath || !machineId) {
            throw new AgentHubError(t('sessionInfo.mergeWorktreeFailed'), false);
        }

        const repoPath = getRepoPath(sessionPath);
        const branchName = getWorktreeName(sessionPath);
        if (!branchName) {
            throw new AgentHubError(t('sessionInfo.mergeWorktreeFailed'), false);
        }

        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;
        const confirmed = await runSessionActionRequest({
            isCurrent,
            request: () => Modal.confirm(
                t('sessionInfo.mergeWorktreeConfirmTitle'),
                t('sessionInfo.mergeWorktreeConfirmMessage', { branch: branchName }),
            ),
        });
        if (!isCurrent() || !confirmed) return;

        const result = await runSessionActionRequest({
            isCurrent,
            request: () => machineSpawnNewSession({
                machineId,
                directory: repoPath,
                agent: 'claude',
            }),
        });
        if (result === null) return;

        if (result.type === 'error') {
            throw new AgentHubError(result.errorMessage || t('sessionInfo.mergeWorktreeFailed'), false);
        }

        if (result.type === 'requestToApproveDirectoryCreation') {
            throw new AgentHubError(t('sessionInfo.mergeWorktreeFailed'), false);
        }

        await runWorktreeMergePostSpawnLifecycle({
            isCurrent,
            refreshSessions: () => sync.refreshSessions(),
            applyPermission: () => {
                storage.getState().updateSessionPermissionMode(result.sessionId, 'acceptEdits');
            },
            sendMergeMessage: async () => {
                await sync.sendMessage(
                    result.sessionId,
                    `Merge branch '${branchName}' into the current branch. Resolve any merge conflicts that arise.`,
                    { source: 'new_session' },
                );
            },
            // Ask whether to archive the worktree session and clean up worktree files.
            // Only archive+cleanup when the user explicitly confirms.
            confirmArchive: () => Modal.confirm(
                t('sessionInfo.mergeWorktreeArchiveTitle'),
                t('sessionInfo.mergeWorktreeArchiveMessage'),
                {
                    confirmText: t('sessionInfo.mergeWorktreeArchiveConfirm'),
                    cancelText: t('sessionInfo.mergeWorktreeArchiveCancel'),
                    destructive: true,
                },
            ),
            archiveOriginal: async () => {
                if (!isCurrent()) return;
                await removeWorktree(machineId, sessionPath).catch(() => {});
                if (!isCurrent()) return;
                const killResult = await sessionKill(session.id);
                if (!isCurrent()) return;
                if (!killResult.success) {
                    await sessionArchive(session.id);
                }
            },
            navigate: () => navigateToSession(result.sessionId),
        });
    });

    return { canMerge, mergingWorktree, mergeWorktreeAction: performMerge };
}
