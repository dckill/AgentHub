import React from 'react';
import { View, Pressable, Platform, Modal as RNModal, ScrollView } from 'react-native';
import { Text } from '@/components/StyledText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type SessionState } from '@/utils/sessionUtils';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import { type ProjectGroupData, type ProjectListViewItem, type SessionRowData } from '@/sync/storage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { SessionActionsAnchor, SessionActionsPopover } from './SessionActionsPopover';
import { useRouter } from 'expo-router';
import { ProjectEditSheet } from '@/components/ProjectEditSheet';
import { ArchivedSessionsOverlay } from '@/components/ArchivedSessionsOverlay';
import { storage } from '@/sync/storage';
import { useSessionListScale } from '@/hooks/useScale';
import { ActionMenu, ActionMenuAnchor, ActionMenuItem } from '@/components/ActionMenu';
import { getActionMenuAnchorFromEvent } from '@/components/actionMenuPosition';
import { ProjectIcon } from '@/components/ProjectIcon';
import { CLIENT_AGENT_LABELS } from '@/sync/agentTypes';
import { ProjectDetailsSheet } from '@/components/ProjectDetailsSheet';
import { GlassSurface } from '@/components/glass';
import { getAgentLabelChipVisuals, getProjectCardVisuals, getSessionRowVisuals } from './sessionListVisuals';
import { Modal as AppModal } from '@/modal';
import { sessionArchive, sessionKill } from '@/sync/ops';
import { maybeCleanupWorktree } from '@/hooks/useWorktreeCleanup';
import { useAgentHubAction } from '@/hooks/useAgentHubAction';
import { sync } from '@/sync/sync';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { machineSpawnNewSession } from '@/sync/ops';
import type { OfficialCodexThread } from '@/sync/officialThreads';
import { connectOfficialCodexSession } from './connectOfficialCodexSession';
import { getSessionRowActionMenuKind, OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS } from './sessionRowActions';
import { getOfficialCandidatesListLayout } from './officialCandidatesLayout';
import { ignoreOfficialThreadsFromWorkbench } from '@/sync/officialWorkbench';
import { runProjectHideLifecycle } from '@/sync/projectHideLifecycle';
import { runProjectSessionArchiveLifecycle } from '@/sync/projectSessionArchiveLifecycle';
import { shouldRenderProjectSessionCard } from '@/sync/projectVisibility';

const STATUS_CONFIG: Record<SessionState, { color: string; dotColor: string; isPulsing: boolean; isConnected: boolean }> = {
    disconnected: { color: '#999', dotColor: '#999', isPulsing: false, isConnected: false },
    thinking: { color: '#007AFF', dotColor: '#007AFF', isPulsing: true, isConnected: true },
    waiting: { color: '#34C759', dotColor: '#34C759', isPulsing: false, isConnected: true },
    permission_required: { color: '#FF9500', dotColor: '#FF9500', isPulsing: true, isConnected: true },
};

function getAgentLabel(flavor: string | null): string {
    if (flavor === 'codex' || flavor === 'gpt' || flavor === 'openai') {
        return CLIENT_AGENT_LABELS.codex;
    }
    return CLIENT_AGENT_LABELS.claude;
}

function getAgentChipKind(flavor: string | null): 'codex' | 'claude' {
    if (flavor === 'codex' || flavor === 'gpt' || flavor === 'openai') {
        return 'codex';
    }
    return 'claude';
}

function getSessionOfficialWorkbenchId(
    session: Pick<SessionRowData, 'source' | 'codexThreadId' | 'claudeSessionId'>,
): string | null {
    if (session.source === 'official-claude') {
        return session.claudeSessionId ? `claude:${session.claudeSessionId}` : null;
    }
    if (session.source === 'official-codex') {
        return session.codexThreadId ?? null;
    }
    return null;
}

function getOfficialWorkbenchStore() {
    const generation = sync.getAccountGeneration();
    return {
        isCurrent: () => generation !== null && sync.getAccountGeneration() === generation,
        getThreads: (machineId: string) => storage.getState().officialCodexThreads[machineId] ?? [],
        applyThreads: (machineId: string, threads: OfficialCodexThread[]) => {
            storage.getState().applyOfficialCodexThreads(machineId, threads);
        },
    };
}

interface ProjectListProps {
    items: ProjectListViewItem[];
    selectedSessionId?: string;
}

export function ProjectList({ items, selectedSessionId }: ProjectListProps) {
    const styles = stylesheet;

    return (
        <View style={styles.container}>
            {items.map((item, index) => {
                if (item.type === 'machine-separator') {
                    return (
                        <MachineSeparator
                            key={`sep-${item.machineId}`}
                            machineName={item.machineName}
                            machineId={item.machineId}
                            collapsed={false}
                            onToggleCollapsed={() => { }}
                        />
                    );
                }

                return (
                    <ProjectGroupView
                        key={item.project.key}
                        project={item.project}
                        selectedSessionId={selectedSessionId}
                    />
                );
            })}
        </View>
    );
}

// Section header: icon + project name | path | branch + worktree + changes | actions
const SectionHeader = React.memo(({ project }: { project: ProjectGroupData }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const { s } = useSessionListScale();
    const [showEditSheet, setShowEditSheet] = React.useState(false);
    const [showArchived, setShowArchived] = React.useState(false);
    const [showDetails, setShowDetails] = React.useState(false);
    const [projectActionsAnchor, setProjectActionsAnchor] = React.useState<ActionMenuAnchor | null>(null);
    const editGenerationRef = React.useRef<number | null>(null);
    const router = useRouter();

    const handleEditOpen = React.useCallback(() => {
        editGenerationRef.current = sync.getAccountGeneration();
        setShowEditSheet(true);
    }, []);

    const handleEditClose = React.useCallback(() => {
        editGenerationRef.current = null;
        setShowEditSheet(false);
    }, []);

    const handleShowArchived = React.useCallback(() => {
        setShowArchived(true);
    }, []);

    const handleShowDetails = React.useCallback(() => {
        setShowDetails(true);
    }, []);

    const handleEditSave = React.useCallback((projectKey: string, name: string, icon: string) => {
        const editGeneration = editGenerationRef.current;
        if (editGeneration === null || sync.getAccountGeneration() !== editGeneration) {
            return;
        }
        const currentCustomizations = storage.getState().settings.projectCustomizations;
        const updated = {
            ...currentCustomizations,
            [projectKey]: {
                ...(currentCustomizations[projectKey] || {}),
                name: name !== project.displayName ? name : undefined,
                icon: icon !== (currentCustomizations[projectKey]?.icon) ? icon : undefined,
            },
        };
        sync.applySettings({ projectCustomizations: updated });
    }, [project.displayName]);

    const hasBranch = !!project.branch || project.isWorktree;
    const hasArchived = project.archivedSessions.length > 0;

    const updateProjectCustomization = React.useCallback((next: { name?: string; icon?: string; archived?: boolean } | null) => {
        const currentCustomizations = storage.getState().settings.projectCustomizations;
        const updated = { ...currentCustomizations };
        if (next) {
            updated[project.key] = next;
        } else {
            delete updated[project.key];
        }
        sync.applySettings({ projectCustomizations: updated });
    }, [project.key]);

    const archiveActiveSessions = React.useCallback(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        return runProjectSessionArchiveLifecycle({
            sessions: project.activeSessions,
            isCurrent,
            archiveSession: async (session, isSessionCurrent) => {
                if (!isSessionCurrent()) {
                    return false;
                }
                await maybeCleanupWorktree(session.id, session.path ?? undefined, session.machineId ?? undefined);
                if (!isSessionCurrent()) {
                    return false;
                }

                const killResult = await sessionKill(session.id);
                if (!isSessionCurrent()) {
                    return false;
                }
                if (!killResult.success) {
                    await sessionArchive(session.id);
                    return isSessionCurrent();
                }
                return true;
            },
            refreshSessions: () => sync.refreshSessions(),
        });
    }, [project.activeSessions]);

    const [endingProjectSessions, performEndProjectSessions] = useAgentHubAction(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) {
            return;
        }
        if (project.activeSessions.length === 0) {
            AppModal.alert(t('project.endActiveSessions'), t('project.noActiveSessions'));
            return;
        }

        const confirmed = await AppModal.confirm(
            t('project.endActiveSessions'),
            t('project.endActiveSessionsConfirm', { count: project.activeSessions.length }),
            { confirmText: t('project.endActiveSessions'), destructive: true },
        );
        if (!confirmed || !isCurrent()) {
            return;
        }

        const archived = await archiveActiveSessions();
        if (!archived || !isCurrent()) {
            return;
        }
        AppModal.alert(t('common.success'), t('project.actionComplete'));
    });

    const [hidingProject, performHideProject] = useAgentHubAction(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) {
            return;
        }
        const confirmed = await AppModal.confirm(
            t('project.hideProject'),
            t('project.hideProjectConfirm', {
                activeCount: project.activeSessions.length,
                officialCount: project.officialCodexThreads.length,
            }),
            { confirmText: t('project.hideProject'), destructive: true },
        );
        if (!confirmed || !isCurrent()) {
            return;
        }

        await runProjectHideLifecycle({
            hasActiveSessions: project.activeSessions.length > 0,
            archiveActiveSessions,
            isCurrent,
            ignoreOfficialThreads: async () => {
                if (project.officialCodexThreads.length === 0) {
                    return;
                }

                const threadsByMachine = new Map<string, string[]>();
                for (const thread of project.officialCodexThreads) {
                    if (!thread.machineId) continue;
                    const officialId = getSessionOfficialWorkbenchId(thread);
                    if (!officialId) continue;
                    const existing = threadsByMachine.get(thread.machineId) ?? [];
                    existing.push(officialId);
                    threadsByMachine.set(thread.machineId, existing);
                }

                const officialWorkbenchStore = getOfficialWorkbenchStore();
                for (const [machineId, officialIds] of threadsByMachine.entries()) {
                    await ignoreOfficialThreadsFromWorkbench({
                        machineId,
                        officialIds,
                        ...officialWorkbenchStore,
                    });
                }
            },
            applyHiddenCustomization: () => {
                const current = storage.getState().settings.projectCustomizations[project.key] || {};
                updateProjectCustomization({ ...current, archived: true });
            },
        });
    });

    const handleResetCustomization = React.useCallback(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) {
            return;
        }
        const confirmed = await AppModal.confirm(
            t('project.resetCustomization'),
            t('project.resetCustomizationConfirm'),
            { confirmText: t('common.reset'), destructive: true },
        );
        if (!confirmed || !isCurrent()) {
            return;
        }
        updateProjectCustomization(null);
        if (!isCurrent()) {
            return;
        }
        AppModal.alert(t('common.success'), t('project.actionComplete'));
    }, [updateProjectCustomization]);

    const handleNewProjectSession = React.useCallback(() => {
        const draft = useNewSessionDraft.getState();
        draft.setMachineId(project.machineId);
        draft.setPath(project.path);
        const firstFlavor = project.activeSessions[0]?.flavor || project.archivedSessions[0]?.flavor;
        if (firstFlavor === 'codex' || firstFlavor === 'gpt' || firstFlavor === 'openai') {
            draft.setAgentType('codex');
        } else {
            draft.setAgentType('claude');
        }
        router.push('/new');
    }, [project.activeSessions, project.archivedSessions, project.machineId, project.path, router]);

    const projectActionItems = React.useMemo<ActionMenuItem[]>(() => {
        const items: ActionMenuItem[] = [];

        items.push({
            id: 'details',
            icon: 'information-circle-outline',
            label: t('project.detailsTitle'),
            onPress: handleShowDetails,
        });

        items.push({
            id: 'new-session',
            icon: 'add-circle-outline',
            label: t('project.newSession'),
            onPress: handleNewProjectSession,
        });

        if (hasArchived) {
            items.push({
                id: 'archived-sessions',
                icon: 'archive-outline',
                label: t('project.archivedSessions'),
                onPress: handleShowArchived,
            });
        }

        items.push({
            id: 'edit-project',
            icon: 'create-outline',
            label: t('project.editTitle'),
            onPress: handleEditOpen,
        });

        items.push({
            id: 'end-active',
            icon: 'stop-circle-outline',
            label: t('project.endActiveSessions'),
            onPress: performEndProjectSessions,
            destructive: true,
            disabled: endingProjectSessions || project.activeSessions.length === 0,
        });

        items.push({
            id: 'hide-project',
            icon: 'archive-outline',
            label: t('project.hideProject'),
            onPress: performHideProject,
            destructive: true,
            disabled: hidingProject,
        });

        items.push({
            id: 'reset-customization',
            icon: 'refresh-outline',
            label: t('project.resetCustomization'),
            onPress: handleResetCustomization,
            destructive: true,
        });

        return items;
    }, [
        hidingProject,
        endingProjectSessions,
        handleEditOpen,
        handleNewProjectSession,
        handleResetCustomization,
        handleShowArchived,
        handleShowDetails,
        hasArchived,
        performHideProject,
        performEndProjectSessions,
        project.activeSessions.length,
    ]);

    const handleProjectActionsPress = React.useCallback((event: any) => {
        event.stopPropagation?.();
        setProjectActionsAnchor(getActionMenuAnchorFromEvent(event));
    }, []);

    const headerContent = (
        <View style={styles.sectionHeader}>
            {/* Project icon */}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('project.editTitle')}
                onPress={handleEditOpen}
                style={styles.sectionHeaderIcon}
            >
                <ProjectIcon icon={project.icon} size={s(48)} />
            </Pressable>

            {/* Project name + path + branch */}
            <View style={styles.sectionHeaderContent}>
                <Text style={[styles.sectionHeaderName, { fontSize: s(15), lineHeight: s(20) }]} numberOfLines={1}>
                    {project.displayName}
                </Text>
                <View style={styles.metadataRow}>
                    <Ionicons
                        name="folder-outline"
                        size={s(12)}
                        color={theme.colors.groupped.sectionTitle}
                        style={styles.metadataIcon}
                    />
                    <Text style={[styles.sectionHeaderPath, { fontSize: s(12), lineHeight: s(16) }]} numberOfLines={1}>
                        {project.displayPath}
                    </Text>
                </View>
                {hasBranch && (
                    <View style={styles.branchRow}>
                        <Ionicons
                            name="git-branch-outline"
                            size={s(12)}
                            color={theme.colors.textSecondary}
                            style={styles.metadataIcon}
                        />
                        {project.isWorktree && (
                            <Ionicons
                                name="git-network-outline"
                                size={s(11)}
                                color={theme.colors.textSecondary}
                                style={styles.worktreeIcon}
                            />
                        )}
                        <Text style={[styles.branchText, { fontSize: s(11) }]} numberOfLines={1}>
                            {project.worktreeName || project.branch || ''}
                        </Text>
                        {project.linesAdded > 0 && (
                            <Text style={[styles.addedText, { fontSize: s(11) }]}>+{project.linesAdded}</Text>
                        )}
                        {project.linesRemoved > 0 && (
                            <Text style={[styles.removedText, { fontSize: s(11) }]}>-{project.linesRemoved}</Text>
                        )}
                    </View>
                )}
            </View>

            <View style={styles.sectionHeaderActions}>
                <Pressable
                    accessibilityLabel={t('project.actions')}
                    accessibilityRole="button"
                    onPress={handleProjectActionsPress}
                    hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                    style={styles.addButton}
                >
                    <Ionicons name="ellipsis-horizontal" size={s(18)} color={theme.colors.textSecondary} />
                </Pressable>
            </View>
        </View>
    );

    return (
        <>
            {headerContent}

            <ActionMenu
                anchor={projectActionsAnchor}
                items={projectActionItems}
                onClose={() => setProjectActionsAnchor(null)}
                title={project.displayName}
                visible={!!projectActionsAnchor}
            />

            <ProjectEditSheet
                visible={showEditSheet}
                onClose={handleEditClose}
                projectKey={project.key}
                initialName={project.displayName}
                initialIcon={project.icon}
                onSave={handleEditSave}
            />

            <ProjectDetailsSheet
                visible={showDetails}
                onClose={() => setShowDetails(false)}
                project={project}
            />

            <RNModal
                visible={showArchived}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={() => setShowArchived(false)}
            >
                <ArchivedSessionsOverlay
                    visible={showArchived}
                    onClose={() => setShowArchived(false)}
                    projectIcon={project.icon}
                    projectName={project.displayName}
                    archivedSessions={project.archivedSessions}
                />
            </RNModal>
        </>
    );
});

interface MachineSeparatorProps {
    machineName: string;
    machineId: string;
    collapsed: boolean;
    onToggleCollapsed: (machineId: string) => void;
}

// Full-width separator between machine groups
export const MachineSeparator = React.memo(({ machineName, machineId, collapsed, onToggleCollapsed }: MachineSeparatorProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();

    const handleToggle = React.useCallback(() => {
        onToggleCollapsed(machineId);
    }, [machineId, onToggleCollapsed]);

    const handleMachinePress = React.useCallback((event: any) => {
        event.stopPropagation?.();
        router.navigate({ pathname: '/machine/[id]', params: { id: machineId } });
    }, [router, machineId]);

    return (
        <View style={styles.machineSeparator}>
            <Pressable
                accessibilityLabel={t(collapsed ? 'project.expandMachineAccessibility' : 'project.collapseMachineAccessibility', { machine: machineName })}
                accessibilityRole="button"
                onPress={handleToggle}
                style={styles.machineSeparatorToggle}
                hitSlop={{ top: 8, bottom: 8 }}
            >
                <View style={styles.machineSeparatorLine} />
                <Ionicons
                    name={collapsed ? 'chevron-forward' : 'chevron-down'}
                    size={12}
                    color={theme.colors.textSecondary}
                    style={styles.machineSeparatorChevron}
                />
                <Text style={styles.machineSeparatorText} numberOfLines={1}>
                    {machineName}
                </Text>
            </Pressable>
            <Pressable
                accessibilityLabel={t('sessionInfo.viewMachine')}
                accessibilityRole="button"
                onPress={handleMachinePress}
                hitSlop={8}
                style={styles.machineSeparatorDetailButton}
            >
                <Ionicons name="desktop-outline" size={12} color={theme.colors.textSecondary} />
            </Pressable>
            <Pressable
                accessibilityLabel={t(collapsed ? 'project.expandMachineAccessibility' : 'project.collapseMachineAccessibility', { machine: machineName })}
                accessibilityRole="button"
                onPress={handleToggle}
                style={styles.machineSeparatorTrailingToggle}
                hitSlop={{ top: 8, bottom: 8 }}
            >
                <View style={styles.machineSeparatorLine} />
            </Pressable>
        </View>
    );
});

// Project group: SectionHeader + session card
export const ProjectGroupView = React.memo(({ project, selectedSessionId }: { project: ProjectGroupData; selectedSessionId?: string }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const cardVisuals = getProjectCardVisuals(theme);
    const [showOfficialCandidates, setShowOfficialCandidates] = React.useState(false);
    const hasOfficialCandidates = project.officialCodexThreads.length > 0;
    const hasSessionCard = shouldRenderProjectSessionCard(
        project.activeSessions.length,
        project.officialCodexThreads.length,
    );
    const toggleOfficialCandidates = React.useCallback(() => {
        setShowOfficialCandidates((current) => !current);
    }, []);

    return (
        <View>
            <SectionHeader project={project} />
            {hasSessionCard ? <GlassSurface
                tone="raised"
                style={[
                    styles.projectCard,
                    {
                        backgroundColor: cardVisuals.backgroundColor,
                        borderColor: cardVisuals.borderColor,
                        shadowColor: cardVisuals.shadowColor,
                    },
                ]}
            >
                {project.activeSessions.map((session, index) => (
                    <CompactSessionRow
                        key={session.id}
                        session={session}
                        selected={selectedSessionId === session.id}
                        showBorder={index < project.activeSessions.length - 1 || hasOfficialCandidates}
                    />
                ))}
                {hasOfficialCandidates && (
                    <OfficialCandidatesSection
                        candidates={project.officialCodexThreads}
                        expanded={showOfficialCandidates}
                        onToggle={toggleOfficialCandidates}
                        selectedSessionId={selectedSessionId}
                    />
                )}
            </GlassSurface> : null}
        </View>
    );
});

const OfficialCandidatesSection = React.memo(({
    candidates,
    expanded,
    onToggle,
    selectedSessionId,
}: {
    candidates: SessionRowData[];
    expanded: boolean;
    onToggle: () => void;
    selectedSessionId?: string;
}) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const { s } = useSessionListScale();
    const rowHeight = s(56);
    const candidateListLayout = React.useMemo(() => (
        getOfficialCandidatesListLayout(candidates.length, rowHeight)
    ), [candidates.length, rowHeight]);

    const candidateRows = candidates.map((session, index) => (
        <CompactSessionRow
            key={session.id}
            session={session}
            selected={selectedSessionId === session.id}
            showBorder={index < candidates.length - 1}
        />
    ));

    return (
        <View>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('project.computerSessions')}
                onPress={onToggle}
                style={[styles.officialSectionHeader, { minHeight: s(44), paddingHorizontal: s(16) }]}
            >
                <View style={styles.officialSectionTitleWrap}>
                    <Ionicons
                        name="desktop-outline"
                        size={s(14)}
                        color={theme.colors.textSecondary}
                        style={{ marginRight: s(8) }}
                    />
                    <Text style={[styles.officialSectionTitle, { fontSize: s(12), lineHeight: s(16) }]} numberOfLines={1}>
                        {t('project.computerSessions')}
                    </Text>
                    <Text style={[styles.officialSectionCount, { fontSize: s(11), lineHeight: s(14) }]} numberOfLines={1}>
                        {candidates.length}
                    </Text>
                </View>
                <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={s(15)}
                    color={theme.colors.textSecondary}
                />
            </Pressable>
            {expanded && (
                candidateListLayout.scrollEnabled ? (
                    <ScrollView
                        style={[styles.officialCandidatesScroll, { maxHeight: candidateListLayout.maxHeight }]}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                    >
                        {candidateRows}
                    </ScrollView>
                ) : candidateRows
            )}
        </View>
    );
});

// Compact session row with status dot indicator
const CompactSessionRow = React.memo(({ session, selected, showBorder }: { session: SessionRowData; selected?: boolean; showBorder?: boolean }) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const { s } = useSessionListScale();
    const status = STATUS_CONFIG[session.state];
    const navigateToSession = useNavigateToSession();
    const [actionsAnchor, setActionsAnchor] = React.useState<SessionActionsAnchor | null>(null);
    const actionMenuKind = getSessionRowActionMenuKind(session);
    const isOfficialSession = actionMenuKind === 'official';
    const [connectingOfficial, performConnectOfficial] = useAgentHubAction(async () => {
        const generation = sync.getAccountGeneration();
        await connectOfficialCodexSession({
            session,
            isCurrent: () => generation !== null && sync.getAccountGeneration() === generation,
            spawnSession: machineSpawnNewSession,
            ensureSessionLoaded: sync.ensureSessionLoaded,
            onSessionVisible: sync.onSessionVisible,
            startOfficialResumeSession: storage.getState().startOfficialResumeSession,
            navigateToSession,
        });
    });
    const [ignoringOfficial, performIgnoreOfficial] = useAgentHubAction(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) {
            return;
        }
        const officialId = getSessionOfficialWorkbenchId(session);
        if ((session.source !== 'official-codex' && session.source !== 'official-claude') || !session.machineId || !officialId) {
            return;
        }

        const confirmed = await AppModal.confirm(
            t(OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS.removeFromWorkbench),
            session.name,
            { confirmText: t(OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS.removeFromWorkbench), destructive: true },
        );
        if (!confirmed || !isCurrent()) {
            return;
        }

        await ignoreOfficialThreadsFromWorkbench({
            machineId: session.machineId,
            officialIds: [officialId],
            ...getOfficialWorkbenchStore(),
        });
    });

    const handlePress = React.useCallback(() => {
        if (isOfficialSession) {
            performConnectOfficial();
            return;
        }
        navigateToSession(session.id);
    }, [isOfficialSession, navigateToSession, performConnectOfficial, session.id]);

    const openActionsFromEvent = React.useCallback((event: any) => {
        event.stopPropagation?.();
        setActionsAnchor(getActionMenuAnchorFromEvent(event));
    }, []);

    const handleContextMenu = React.useCallback((event: any) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        setActionsAnchor({
            type: 'point',
            x: event.nativeEvent.clientX ?? event.nativeEvent.pageX ?? 0,
            y: event.nativeEvent.clientY ?? event.nativeEvent.pageY ?? 0,
        });
    }, []);

    const menuProps = Platform.OS === 'web' ? {
        onContextMenu: handleContextMenu,
    } as any : {};

    const officialActionItems = React.useMemo<ActionMenuItem[]>(() => isOfficialSession ? [
        {
            id: 'resume-official',
            icon: connectingOfficial ? 'hourglass-outline' : 'play-circle-outline',
            label: t(OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS.takeOver),
            onPress: handlePress,
            disabled: connectingOfficial || ignoringOfficial,
        },
        {
            id: 'ignore-official',
            icon: 'eye-off-outline',
            label: t(OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS.removeFromWorkbench),
            onPress: performIgnoreOfficial,
            destructive: true,
            disabled: connectingOfficial || ignoringOfficial,
        },
    ] : [], [
        connectingOfficial,
        handlePress,
        isOfficialSession,
        ignoringOfficial,
        performIgnoreOfficial,
        session.name,
    ]);

    const hasTodoProgress = session.totalTodosCount > 0;
    const todoPercent = hasTodoProgress
        ? Math.round((session.completedTodosCount / session.totalTodosCount) * 100)
        : 0;
    const rowVisuals = getSessionRowVisuals(theme, selected);
    const agentFlavor = isOfficialSession
        ? (session.officialSourceLabel ?? session.flavor)
        : session.flavor;
    const agentChipVisuals = getAgentLabelChipVisuals(theme, getAgentChipKind(agentFlavor));

    const scaledSessionRow = React.useMemo(() => ({
        height: s(hasTodoProgress ? 70 : 56),
        paddingHorizontal: s(16),
    }), [hasTodoProgress, s]);

    const scaledStatusDot = React.useMemo(() => ({
        width: s(16),
        height: s(16),
    }), [s]);

    const itemContent = (
        <View
            style={[
                styles.sessionRow,
                scaledSessionRow,
                {
                    backgroundColor: rowVisuals.backgroundColor,
                    borderColor: rowVisuals.borderColor,
                },
                showBorder && styles.sessionRowWithBorder,
                selected && styles.sessionRowSelected,
            ]}
        >
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={session.name}
                accessibilityState={{ selected: !!selected }}
                onPress={handlePress}
                onLongPress={openActionsFromEvent}
                style={styles.sessionPrimaryAction}
                {...menuProps}
            >
                <View style={styles.sessionContent}>
                    <View style={styles.sessionTitleRow}>
                        {(() => {
                            if (isOfficialSession) {
                                return (
                                    <Ionicons
                                        name="desktop-outline"
                                        size={s(14)}
                                        color={theme.colors.textSecondary}
                                        style={{ marginRight: s(8) }}
                                    />
                                );
                            }

                            if (session.state === 'waiting' && session.hasDraft) {
                                return (
                                    <Ionicons
                                        name="create-outline"
                                        size={s(14)}
                                        color={theme.colors.textSecondary}
                                        style={{ marginRight: s(8) }}
                                    />
                                );
                            }

                            if (session.state === 'permission_required' || session.state === 'thinking') {
                                return (
                                    <View style={[styles.statusDotContainer, scaledStatusDot, { marginRight: s(8) }]}>
                                        <StatusDot color={status.dotColor} isPulsing={status.isPulsing} />
                                    </View>
                                );
                            }

                            if (session.state === 'waiting') {
                                return (
                                    <View style={[styles.statusDotContainer, scaledStatusDot, { marginRight: s(8) }]}>
                                        <StatusDot
                                            color={session.hasUnviewedCompletion ? status.dotColor : theme.colors.textSecondary}
                                            isPulsing={false}
                                        />
                                    </View>
                                );
                            }

                            return null;
                        })()}

                        <Text
                            style={[
                                styles.sessionTitle,
                                { fontSize: s(15) },
                                status.isConnected ? styles.sessionTitleConnected : styles.sessionTitleDisconnected
                            ]}
                            numberOfLines={2}
                        >
                            {session.name}
                        </Text>
                    </View>
                    {hasTodoProgress && (
                        <View style={[styles.sessionTodoRow, { gap: s(6), marginTop: s(5) }]}>
                            <Ionicons name="checkmark-done-outline" size={s(13)} color={theme.colors.success} />
                            <View style={[styles.sessionTodoTrack, { width: s(48), height: s(4), borderRadius: s(2), backgroundColor: theme.colors.surfaceHigh }]}>
                                <View
                                    style={[
                                        styles.sessionTodoFill,
                                        {
                                            width: `${todoPercent}%`,
                                            borderRadius: s(2),
                                            backgroundColor: theme.colors.success,
                                        },
                                    ]}
                                />
                            </View>
                            <Text style={[styles.sessionTodoText, { fontSize: s(11), lineHeight: s(14) }]} numberOfLines={1}>
                                {t('tools.todo.listBadge', { completed: session.completedTodosCount, total: session.totalTodosCount })}
                            </Text>
                        </View>
                    )}
                </View>
                <View style={[styles.badgeGroup, { marginRight: s(8) }]}>
                    {isOfficialSession ? (
                        <View
                            style={[
                                styles.officialTakeoverPill,
                                {
                                    minHeight: s(24),
                                    paddingHorizontal: s(9),
                                    backgroundColor: theme.colors.accentSoft,
                                },
                            ]}
                        >
                            <Ionicons name="play-circle-outline" size={s(12)} color={theme.colors.accent} />
                            <Text
                                style={[
                                    styles.officialTakeoverText,
                                    {
                                        color: theme.colors.accent,
                                        fontSize: s(11),
                                        lineHeight: s(13),
                                    },
                                ]}
                                numberOfLines={1}
                            >
                                {t(OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS.takeOver)}
                            </Text>
                        </View>
                    ) : (
                        <View
                            style={[
                                styles.agentBadge,
                                {
                                    minHeight: s(20),
                                    paddingHorizontal: s(7),
                                    backgroundColor: agentChipVisuals.backgroundColor,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.agentBadgeText,
                                    {
                                        color: agentChipVisuals.textColor,
                                        fontSize: s(10),
                                        lineHeight: s(12),
                                    },
                                ]}
                                numberOfLines={1}
                            >
                                {getAgentLabel(agentFlavor)}
                            </Text>
                        </View>
                    )}
                </View>
            </Pressable>
            <Pressable
                accessibilityLabel={t('sessionInfo.quickActions')}
                accessibilityRole="button"
                style={styles.infoButton}
                onPress={openActionsFromEvent}
                hitSlop={8}
            >
                <Ionicons
                    name="ellipsis-horizontal"
                    size={s(20)}
                    color={theme.colors.textSecondary}
                    style={styles.infoIcon}
                />
            </Pressable>
        </View>
    );

    return (
        <>
            {itemContent}
            {actionMenuKind === 'agenthub' && (
                <SessionActionsPopover
                    anchor={actionsAnchor}
                    onClose={() => setActionsAnchor(null)}
                    sessionId={session.id}
                    visible={!!actionsAnchor}
                />
            )}
            {actionMenuKind === 'official' && (
                <ActionMenu
                    anchor={actionsAnchor}
                    items={officialActionItems}
                    onClose={() => setActionsAnchor(null)}
                    title={session.name}
                    visible={!!actionsAnchor}
                />
            )}
        </>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        paddingTop: 8,
    },
    // Section header styles — three-line layout with large icon
    sectionHeader: {
        paddingTop: 12,
        paddingBottom: Platform.select({ ios: 6, default: 8 }),
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionHeaderIcon: {
        marginRight: 10,
    },
    sectionHeaderContent: {
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
    },
    sectionHeaderName: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        fontSize: Platform.select({ ios: 15, default: 15 }),
        lineHeight: Platform.select({ ios: 20, default: 21 }),
    },
    sectionHeaderPath: {
        ...Typography.default('regular'),
        color: theme.colors.groupped.sectionTitle,
        fontSize: Platform.select({ ios: 12, default: 13 }),
        lineHeight: Platform.select({ ios: 16, default: 18 }),
        letterSpacing: 0,
        flexShrink: 1,
        minWidth: 0,
    },
    metadataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
    },
    branchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 1,
        minWidth: 0,
    },
    metadataIcon: {
        marginRight: 4,
        flexShrink: 0,
    },
    branchText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
        flexShrink: 1,
        minWidth: 0,
    },
    worktreeIcon: {
        marginLeft: 0,
        marginRight: 3,
    },
    addedText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.dark ? theme.colors.gitAddedText : theme.colors.diff.inlineAddedText,
        marginLeft: 6,
    },
    removedText: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.gitRemovedText,
        marginLeft: 3,
    },
    sectionHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 4,
    },
    addButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Machine separator styles
    machineSeparator: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Platform.select({ ios: 32, default: 24 }),
        paddingTop: 8,
        paddingBottom: 0,
    },
    machineSeparatorToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
        minWidth: 0,
        minHeight: 44,
    },
    machineSeparatorTrailingToggle: {
        flex: 1,
        minHeight: 44,
        justifyContent: 'center',
    },
    machineSeparatorLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.divider,
    },
    machineSeparatorChevron: {
        marginLeft: 6,
        marginRight: 4,
    },
    machineSeparatorText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
        flexShrink: 1,
        maxWidth: '55%',
    },
    machineSeparatorDetailButton: {
        width: 44,
        height: 44,
        marginLeft: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Project card styles
    projectCard: {
        backgroundColor: theme.colors.surface,
        marginBottom: 8,
        marginHorizontal: Platform.select({ ios: 16, default: 12 }),
        borderRadius: Platform.select({ ios: 10, default: 16 }),
        overflow: 'hidden',
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 0.33 },
        shadowOpacity: theme.colors.shadow.opacity,
        shadowRadius: 0,
        elevation: 1,
    },
    // Session row styles
    sessionRow: {
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: theme.colors.surface,
    },
    sessionPrimaryAction: {
        flex: 1,
        minWidth: 0,
        minHeight: 44,
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
    },
    sessionRowWithBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    sessionRowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    sessionContent: {
        flex: 1,
        justifyContent: 'center',
        minWidth: 0,
    },
    sessionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
    },
    sessionTitle: {
        fontSize: 15,
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
        ...Typography.default('regular'),
    },
    sessionTodoRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sessionTodoTrack: {
        overflow: 'hidden',
    },
    sessionTodoFill: {
        height: '100%',
    },
    sessionTodoText: {
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
        flexShrink: 1,
    },
    sessionTitleConnected: {
        color: theme.colors.text,
    },
    sessionTitleDisconnected: {
        color: theme.colors.textSecondary,
    },
    statusDotContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
    },
    infoButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    badgeGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    agentBadge: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        paddingVertical: 2,
    },
    agentBadgeText: {
        ...Typography.default('semiBold'),
        includeFontPadding: false,
    },
    officialSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.surfaceHover,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    officialSectionTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        minWidth: 0,
    },
    officialSectionTitle: {
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
        letterSpacing: 0,
        flexShrink: 1,
        minWidth: 0,
    },
    officialSectionCount: {
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
        marginLeft: 6,
    },
    officialCandidatesScroll: {
        overflow: 'hidden',
    },
    officialTakeoverPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        flexShrink: 0,
    },
    officialTakeoverText: {
        ...Typography.default('semiBold'),
        includeFontPadding: false,
    },
    infoIcon: {
        color: theme.colors.textSecondary,
    },
}));
