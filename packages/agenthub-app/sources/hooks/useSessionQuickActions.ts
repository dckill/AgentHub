import * as React from 'react';
import { useAgentHubAction } from '@/hooks/useAgentHubAction';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { Modal } from '@/modal';
import { applyArchiveStopObservation, applyArchiveStopProjection, forkAndSpawn, machineResumeSession, requestSessionArchiveStop } from '@/sync/ops';
import type { SessionArchiveStopResult } from '@/sync/ops';
import { maybeCleanupWorktree } from '@/hooks/useWorktreeCleanup';
import { storage, useLocalSetting, useMachine, useSetting } from '@/sync/storage';
import { Machine, Session } from '@/sync/storageTypes';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { AgentHubError } from '@/utils/errors';
import { copySessionMetadataToClipboard, copySessionMetadataAndLogsToClipboard } from '@/utils/copySessionMetadataToClipboard';
import { useSessionStatus } from '@/utils/sessionUtils';
import { isMachineOnline } from '@/utils/machineUtils';
import { useRouter } from 'expo-router';
import { useSession } from '@/sync/storage';
import { useWorktreeMerge } from '@/hooks/useWorktreeMerge';
import { getSessionForkSource } from '@/utils/sessionFork';
import { showDuplicateSheet } from '@/components/DuplicateSheet';
import { runSessionArchiveActionLifecycle } from '@/sync/sessionArchiveActionLifecycle';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';

export interface SessionActionItem {
    id: string;
    label: string;
    icon: string;
    onPress: () => void;
    destructive?: boolean;
}

interface UseSessionQuickActionsOptions {
    onAfterArchive?: () => void;
    onAfterDelete?: () => void;
    onAfterCopySessionMetadata?: () => void;
}

type ResumeAvailability = {
    canResume: boolean;
    canShowResume: boolean;
    subtitle: string;
    message: string;
};

function getResumeAvailability(session: Session, machine: Machine | null | undefined, isConnected: boolean): ResumeAvailability {
    if (isConnected) {
        return {
            canResume: false,
            canShowResume: false,
            subtitle: '',
            message: '',
        };
    }

    const machineId = session.metadata?.machineId;
    if (!machineId) {
        const message = t('sessionInfo.resumeSessionMissingMachine');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    const hasBackendResumeId = Boolean(session.metadata?.claudeSessionId || session.metadata?.codexThreadId);
    if (!hasBackendResumeId) {
        const message = t('sessionInfo.resumeSessionMissingBackendId');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!machine) {
        const message = t('sessionInfo.resumeSessionSameMachineOnly');
        return {
            canResume: false,
            canShowResume: true,
            subtitle: message,
            message,
        };
    }

    if (!isMachineOnline(machine)) {
        return {
            canResume: false,
            canShowResume: true,
            subtitle: t('sessionInfo.resumeSessionMachineOffline'),
            message: t('sessionInfo.resumeSessionMachineOffline'),
        };
    }

    return {
        canResume: true,
        canShowResume: true,
        subtitle: t('sessionInfo.resumeSessionSubtitle'),
        message: t('sessionInfo.resumeSessionSubtitle'),
    };
}

export function useSessionQuickActions(
    session: Session,
    options: UseSessionQuickActionsOptions = {},
) {
    const {
        onAfterArchive,
        onAfterCopySessionMetadata,
    } = options;
    const router = useRouter();
    const navigateToSession = useNavigateToSession();
    const sessionStatus = useSessionStatus(session);
    const machineId = session.metadata?.machineId ?? '';
    const machine = useMachine(machineId);
    const devModeEnabled = useLocalSetting('devModeEnabled');
    const expResumeSession = useSetting('expResumeSession');
    const resumeAvailability = React.useMemo(
        () => expResumeSession ? getResumeAvailability(session, machine, sessionStatus.isConnected) : { canResume: false, canShowResume: false, subtitle: '', message: '' },
        [machine, session, sessionStatus.isConnected, expResumeSession],
    );
    const forkSource = React.useMemo(() => getSessionForkSource(session), [session]);
    const canFork = Boolean(forkSource && machine && isMachineOnline(machine));

    const openDetails = React.useCallback(() => {
        router.push(`/session/${session.id}/info`);
    }, [router, session.id]);

    const copySessionMetadata = React.useCallback(() => {
        void (async () => {
            const copied = await copySessionMetadataToClipboard(session);
            if (copied) {
                onAfterCopySessionMetadata?.();
            }
        })();
    }, [onAfterCopySessionMetadata, session]);

    const copySessionMetadataAndLogs = React.useCallback(() => {
        void (async () => {
            const copied = await copySessionMetadataAndLogsToClipboard(session);
            if (copied) {
                onAfterCopySessionMetadata?.();
            }
        })();
    }, [onAfterCopySessionMetadata, session]);

    const [resumingSession, performResume] = useAgentHubAction(async () => {
        if (!resumeAvailability.canResume) {
            throw new AgentHubError(resumeAvailability.message, false);
        }

        if (!machineId) {
            throw new AgentHubError(t('sessionInfo.resumeSessionMissingMachine'), false);
        }

        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        const result = await runSessionActionRequest({
            isCurrent,
            request: () => machineResumeSession({
                machineId,
                sessionId: session.id,
                model: session.modelMode ?? undefined,
                permissionMode: session.permissionMode ?? undefined,
            }),
        });
        if (result === null) return;

        switch (result.type) {
            case 'success': {
                // Session reconnects to the same ID, so messages are preserved.
                // Refresh to pick up the updated session state.
                await sync.refreshSessions();
                if (!isCurrent()) return;

                if (session.permissionMode) {
                    storage.getState().updateSessionPermissionMode(result.sessionId, session.permissionMode);
                }
                if (session.modelMode) {
                    storage.getState().updateSessionModelMode(result.sessionId, session.modelMode);
                }

                navigateToSession(result.sessionId);
                return;
            }
            case 'requestToApproveDirectoryCreation':
                throw new AgentHubError(t('sessionInfo.resumeSessionUnexpectedDirectoryPrompt'), false);
            case 'error':
                throw new AgentHubError(result.errorMessage, false);
        }
    });

    const [archivingSession, performArchive] = useAgentHubAction(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        try {
            await runSessionArchiveActionLifecycle<Extract<SessionArchiveStopResult, { source: 'daemon' }>, SessionArchiveStopResult>({
                isCurrent,
                cleanup: () => maybeCleanupWorktree(session.id, session.metadata?.path, session.metadata?.machineId),
                // Prefer daemon-managed structured stopping; preserve legacy kill/archive
                // fallback for old, offline, or already-exited runners.
                stop: (onDaemonState) => requestSessionArchiveStop(session.id, machineId || undefined, {
                    onDaemonState,
                }),
                applyObservation: (daemonState) => {
                    storage.getState().applySessions([applyArchiveStopObservation(session, daemonState)]);
                },
                applyProjection: (stopResult) => {
                    storage.getState().applySessions([applyArchiveStopProjection(session, stopResult)]);
                },
                refresh: () => sync.refreshSessions().catch(() => {}),
                onAfterArchive: () => onAfterArchive?.(),
            });
        } catch (error) {
            throw new AgentHubError(error instanceof Error ? error.message : t('sessionInfo.failedToArchiveSession'), false);
        }
    });

    const [forkingSession, performFork] = useAgentHubAction(async () => {
        if (!forkSource) {
            throw new AgentHubError(t('session.forkErrorMissingMetadata'), false);
        }
        if (!canFork) {
            throw new AgentHubError(t('session.forkMachineOffline'), false);
        }
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        const result = await runSessionActionRequest({
            isCurrent,
            request: async () => await forkAndSpawn(forkSource),
        });
        if (result === null) return;
        if (result.type !== 'success') {
            throw new AgentHubError(
                result.type === 'error' ? result.errorMessage : t('session.forkErrorGeneric'),
                false,
            );
        }
        if (!isCurrent()) return;
        if (session.permissionMode) storage.getState().updateSessionPermissionMode(result.sessionId, session.permissionMode);
        if (session.modelMode) storage.getState().updateSessionModelMode(result.sessionId, session.modelMode);
        navigateToSession(result.sessionId);
    });

    const openDuplicateSheet = React.useCallback(() => {
        if (!forkSource) {
            Modal.alert(t('common.error'), t('session.forkErrorMissingMetadata'));
            return;
        }
        if (!canFork) {
            Modal.alert(t('common.error'), t('session.forkMachineOffline'));
            return;
        }
        showDuplicateSheet({ sessionId: session.id });
    }, [canFork, forkSource, session.id]);

    const archiveSession = React.useCallback(() => {
        performArchive();
    }, [performArchive]);

    const resumeSession = React.useCallback(() => {
        performResume();
    }, [performResume]);

    const { canMerge, mergingWorktree, mergeWorktreeAction } = useWorktreeMerge(session);

    const canCopySessionMetadata = __DEV__ || devModeEnabled;

    const actionItems = React.useMemo<SessionActionItem[]>(() => {
        const items: SessionActionItem[] = [
            { id: 'details', icon: 'information-circle-outline', label: t('profile.details'), onPress: openDetails },
        ];

        if (resumeAvailability.canShowResume) {
            items.push({ id: 'resume', icon: 'play-circle-outline', label: t('sessionInfo.resumeSession'), onPress: resumeSession });
        }

        if (forkSource) {
            items.push({ id: 'fork-session', icon: 'git-branch-outline', label: t('session.forkSession'), onPress: performFork });
            items.push({ id: 'duplicate-session', icon: 'copy-outline', label: t('session.duplicateSession'), onPress: openDuplicateSheet });
        }

        if (canMerge) {
            items.push({ id: 'merge-worktree', icon: 'git-merge-outline', label: t('sessionInfo.mergeWorktree'), onPress: mergeWorktreeAction });
        }

        if (canCopySessionMetadata) {
            items.push({ id: 'copy-metadata', icon: 'bug-outline', label: t('sessionInfo.copyMetadata'), onPress: copySessionMetadata });
            items.push({ id: 'copy-metadata-and-logs', icon: 'document-text-outline', label: t('sessionInfo.copyMetadata') + ' & Client Logs', onPress: copySessionMetadataAndLogs });
        }

        items.push({ id: 'archive', icon: 'archive-outline', label: t('sessionInfo.archiveSession'), onPress: archiveSession, destructive: true });

        return items;
    }, [
        archiveSession,
        canCopySessionMetadata,
        canMerge,
        copySessionMetadata,
        copySessionMetadataAndLogs,
        forkSource,
        mergeWorktreeAction,
        openDetails,
        openDuplicateSheet,
        performFork,
        resumeAvailability.canShowResume,
        resumeSession,
    ]);

    const showActionAlert = React.useCallback(() => {
        const buttons: Array<{ text: string; onPress?: () => void; style?: 'cancel' | 'destructive' | 'default' }> = actionItems.map(item => ({
            text: item.label,
            onPress: item.onPress,
            style: item.destructive ? 'destructive' as const : undefined,
        }));
        buttons.push({ text: t('common.cancel'), style: 'cancel' });
        Modal.alert('Session', undefined, buttons);
    }, [actionItems]);

    return {
        actionItems,
        showActionAlert,
        archiveSession,
        archivingSession,
        canArchive: true,
        canCopySessionMetadata,
        canMerge,
        canFork,
        canResume: resumeAvailability.canResume,
        canShowResume: resumeAvailability.canShowResume,
        copySessionMetadata,
        copySessionMetadataAndLogs,
        mergeWorktreeAction,
        mergingWorktree,
        forkSession: performFork,
        forkingSession,
        openDuplicateSheet,
        openDetails,
        resumeSession,
        resumeSessionSubtitle: resumeAvailability.subtitle,
        resumingSession,
    };
}

/**
 * Lightweight hook for list items that only have a sessionId.
 * Returns a long-press handler that shows the action alert on mobile.
 */
export function useSessionActionAlert(sessionId: string) {
    const session = useSession(sessionId);
    const { showActionAlert } = useSessionQuickActions(session!, {});
    return session ? showActionAlert : undefined;
}
