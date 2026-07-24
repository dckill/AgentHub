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

        const confirmed = await Modal.confirm(
            t('sessionInfo.mergeWorktreeConfirmTitle'),
            t('sessionInfo.mergeWorktreeConfirmMessage', { branch: branchName }),
        );
        if (!confirmed) return;

        const result = await machineSpawnNewSession({
            machineId,
            directory: repoPath,
            agent: 'claude',
        });

        if (result.type === 'error') {
            throw new AgentHubError(result.errorMessage || t('sessionInfo.mergeWorktreeFailed'), false);
        }

        if (result.type === 'requestToApproveDirectoryCreation') {
            throw new AgentHubError(t('sessionInfo.mergeWorktreeFailed'), false);
        }

        await sync.refreshSessions();
        storage.getState().updateSessionPermissionMode(result.sessionId, 'acceptEdits');

        await sync.sendMessage(
            result.sessionId,
            `Merge branch '${branchName}' into the current branch. Resolve any merge conflicts that arise.`,
            { source: 'new_session' },
        );

        // Ask whether to archive the worktree session and clean up worktree files.
        // Only archive+cleanup when the user explicitly confirms.
        const shouldArchive = await Modal.confirm(
            t('sessionInfo.mergeWorktreeArchiveTitle'),
            t('sessionInfo.mergeWorktreeArchiveMessage'),
            {
                confirmText: t('sessionInfo.mergeWorktreeArchiveConfirm'),
                cancelText: t('sessionInfo.mergeWorktreeArchiveCancel'),
                destructive: true,
            },
        );

        if (shouldArchive) {
            await removeWorktree(machineId, sessionPath).catch(() => {});
            const killResult = await sessionKill(session.id);
            if (!killResult.success) {
                await sessionArchive(session.id);
            }
        }

        navigateToSession(result.sessionId);
    });

    return { canMerge, mergingWorktree, mergeWorktreeAction: performMerge };
}
