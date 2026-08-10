import React, { useCallback } from 'react';
import { View, Text, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { storage, useSession, useIsDataReady, useSetting } from '@/sync/storage';
import { useEnsureSessionLoaded } from '@/hooks/useEnsureSessionLoaded';
import { getSessionName, useSessionStatus, formatOSPlatform, formatPathRelativeToHome, getResumeCommand } from '@/utils/sessionUtils';
import { getSessionProjectIcon } from '@/utils/projectIcons';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/modal';
import { applyArchiveStopObservation, applyArchiveStopProjection, requestSessionArchiveStop, sessionKill, sessionDelete } from '@/sync/ops';
import { maybeCleanupWorktree } from '@/hooks/useWorktreeCleanup';
import { useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { isVersionSupported, MINIMUM_CLI_VERSION } from '@/utils/versionUtils';
import { CodeView } from '@/components/CodeView';
import { Session } from '@/sync/storageTypes';
import { useAgentHubAction } from '@/hooks/useAgentHubAction';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { copySessionMetadataToClipboard, copySessionMetadataAndLogsToClipboard } from '@/utils/copySessionMetadataToClipboard';
import { AgentHubError } from '@/utils/errors';
import { CLIENT_AGENT_LABELS, isSupportedClientAgent } from '@/sync/agentTypes';
import { ProjectIcon } from '@/components/ProjectIcon';
import { getSessionLifecycleVisual } from '@/utils/sessionLifecycleStatus';
import { getArchiveFeedbackNavigationDelayMs, navigateAfterSessionArchive, navigateAfterSessionDelete } from '@/-session/sessionInfoArchiveNavigation';
import { ScreenReaderHeading } from '@/components/ScreenReaderHeading';
import { sync } from '@/sync/sync';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';

// Animated status dot component
function StatusDot({ color, isPulsing, size = 8 }: { color: string; isPulsing?: boolean; size?: number }) {
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        if (isPulsing) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.3,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isPulsing, pulseAnim]);

    return (
        <Animated.View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                opacity: pulseAnim,
                marginRight: 4,
            }}
        />
    );
}

function formatSandboxMetadata(sandbox: unknown, homeDir?: string): string {
    if (sandbox === null || sandbox === undefined) {
        return 'Disabled';
    }

    if (typeof sandbox === 'string') {
        return sandbox;
    }

    if (typeof sandbox !== 'object') {
        return String(sandbox);
    }

    const value = sandbox as Record<string, unknown>;
    if (value.enabled === false) {
        return 'Disabled';
    }

    const parts: string[] = ['Enabled'];
    const isolation = typeof value.sessionIsolation === 'string' ? value.sessionIsolation : undefined;
    const networkMode = typeof value.networkMode === 'string' ? value.networkMode : undefined;
    const workspaceRoot = typeof value.workspaceRoot === 'string' ? value.workspaceRoot : undefined;

    if (isolation) {
        parts.push(`isolation=${isolation}`);
    }
    if (networkMode) {
        parts.push(`network=${networkMode}`);
    }
    if (workspaceRoot) {
        parts.push(`workspace=${formatPathRelativeToHome(workspaceRoot, homeDir)}`);
    }

    return parts.join(' | ');
}

function formatDangerouslySkipPermissionsMetadata(
    value: unknown,
    flavor: string | null | undefined,
    permissionMode: Session['permissionMode'],
    sandbox: unknown,
): string {
    if (typeof value === 'boolean') {
        return value ? 'Enabled' : 'Disabled';
    }

    if (permissionMode === 'bypassPermissions' || permissionMode === 'yolo') {
        return 'Enabled';
    }

    if (flavor === 'claude' && sandbox && typeof sandbox === 'object') {
        const sandboxValue = sandbox as Record<string, unknown>;
        if (sandboxValue.enabled === true) {
            return 'Enabled';
        }
    }

    return 'Unknown';
}

function SessionInfoContent({ session }: { session: Session }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const generation = React.useRef(sync.getAccountGeneration()).current;
    const isCurrent = React.useCallback(
        () => generation !== null && sync.getAccountGeneration() === generation,
        [generation],
    );
    const devModeEnabled = __DEV__;
    const sessionName = getSessionName(session);
    const sessionStatus = useSessionStatus(session);
    const [archiveLifecycleState, setArchiveLifecycleState] = React.useState<string>();
    const archiveLifecycleVisual = getSessionLifecycleVisual(archiveLifecycleState || session.metadata?.lifecycleState);
    const archiveLifecycleLabel = archiveLifecycleVisual ? t(archiveLifecycleVisual.labelKey) : undefined;
    const projectCustomizations = useSetting('projectCustomizations');
    const sessionIcon = getSessionProjectIcon(session, projectCustomizations);
    const agentLabel = React.useMemo(() => {
        const flavor = session.metadata?.flavor || 'claude';
        if (flavor === 'gpt' || flavor === 'openai') return CLIENT_AGENT_LABELS.codex;
        if (isSupportedClientAgent(flavor)) return CLIENT_AGENT_LABELS[flavor];
        return CLIENT_AGENT_LABELS.claude;
    }, [session.metadata?.flavor]);
    const {
        canShowResume,
        resumeSession,
        resumeSessionSubtitle,
        canMerge,
        mergingWorktree,
        mergeWorktreeAction,
    } = useSessionQuickActions(session);
    
    // Check if CLI version is outdated
    const isCliOutdated = session.metadata?.version && !isVersionSupported(session.metadata.version, MINIMUM_CLI_VERSION);

    const handleCopySessionId = useCallback(async () => {
        if (!session) return;
        try {
            await Clipboard.setStringAsync(session.id);
            Modal.alert(t('common.success'), t('sessionInfo.agentHubSessionIdCopied'));
        } catch (error) {
            Modal.alert(t('common.error'), t('sessionInfo.failedToCopySessionId'));
        }
    }, [session]);

    const handleCopyMetadata = useCallback(() => {
        void copySessionMetadataToClipboard(session);
    }, [session]);

    const handleCopyMetadataAndLogs = useCallback(() => {
        void copySessionMetadataAndLogsToClipboard(session);
    }, [session]);

    // Use AgentHubAction for archiving - it handles errors automatically
    const [archivingSession, performArchive] = useAgentHubAction(async () => {
        if (!isCurrent()) return;
        // Prompt for worktree cleanup before killing (needs an active machine connection)
        await maybeCleanupWorktree(session.id, session.metadata?.path, session.metadata?.machineId, { isCurrent });
        if (!isCurrent()) return;

        // Use the same structured daemon stop and legacy fallback as the
        // session quick-actions menu.
        let stopResult;
        try {
            stopResult = await runSessionActionRequest({
                isCurrent,
                request: () => requestSessionArchiveStop(session.id, session.metadata?.machineId, {
                    onDaemonState: (daemonState) => {
                        if (!isCurrent()) return;
                        setArchiveLifecycleState(daemonState.state === 'stopping' ? 'archiveRequested' : daemonState.state);
                        storage.getState().applySessions([applyArchiveStopObservation(session, daemonState)]);
                    },
                }),
            });
        } catch (error) {
            throw new AgentHubError(error instanceof Error ? error.message : t('sessionInfo.failedToArchiveSession'), false);
        }
        if (!isCurrent() || !stopResult) return;
        storage.getState().applySessions([applyArchiveStopProjection(session, stopResult)]);
        navigateAfterSessionArchive(router, getArchiveFeedbackNavigationDelayMs(stopResult.state), isCurrent);
    });

    const handleArchiveSession = useCallback(() => {
        if (isCurrent()) performArchive();
    }, [isCurrent, performArchive]);

    // Use AgentHubAction for deletion - kills session first if needed, then deletes
    const [deletingSession, performDelete] = useAgentHubAction(async () => {
        if (!isCurrent()) return;
        // Prompt for worktree cleanup before killing (needs an active machine connection)
        await maybeCleanupWorktree(session.id, session.metadata?.path, session.metadata?.machineId, { isCurrent });
        if (!isCurrent()) return;

        // Kill session first if it's still active (best-effort)
        if (sessionStatus.isConnected || session.active) {
            await runSessionActionRequest({
                isCurrent,
                request: () => sessionKill(session.id).catch(() => {}),
            });
            if (!isCurrent()) return;
        }

        const result = await runSessionActionRequest({
            isCurrent,
            request: () => sessionDelete(session.id),
        });
        if (!isCurrent() || !result) return;
        if (!result.success) {
            throw new AgentHubError(result.message || t('sessionInfo.failedToDeleteSession'), false);
        }
        navigateAfterSessionDelete(router, () => {
            if (isCurrent()) storage.getState().deleteSession(session.id);
        }, undefined, isCurrent);
    });

    const handleDeleteSession = useCallback(() => {
        Modal.alert(
            t('sessionInfo.deleteSession'),
            t('sessionInfo.deleteSessionWarning'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.deleteSession'),
                    style: 'destructive',
                    onPress: () => {
                        if (isCurrent()) performDelete();
                    }
                }
            ]
        );
    }, [isCurrent, performDelete]);

    const formatDate = useCallback((timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    }, []);

    const handleCopyUpdateCommand = useCallback(async () => {
        const updateCommand = 'npm install -g @artsum/agenthub@latest';
        try {
            await Clipboard.setStringAsync(updateCommand);
            Modal.alert(t('common.success'), updateCommand);
        } catch (error) {
            Modal.alert(t('common.error'), t('common.error'));
        }
    }, []);

    return (
        <>
            <ItemList role="main">
                <ScreenReaderHeading title={sessionName} />
                {/* Session Header */}
                <View style={{ maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }}>
                    <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: theme.colors.surface, marginBottom: 8, borderRadius: 12, marginHorizontal: 16, marginTop: 16 }}>
                        <ProjectIcon
                            icon={sessionIcon}
                            size={80}
                            style={{ opacity: sessionStatus.isConnected ? 1 : 0.5 }}
                        />
                        <Text style={{
                            fontSize: 20,
                            fontWeight: '600',
                            marginTop: 12,
                            textAlign: 'center',
                            color: theme.colors.text,
                            ...Typography.default('semiBold')
                        }}>
                            {sessionName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                            <StatusDot color={sessionStatus.state === 'disconnected' ? theme.colors.textSecondary : sessionStatus.statusDotColor} isPulsing={sessionStatus.isPulsing} size={10} />
                            <Text style={{
                                fontSize: 15,
                                color: sessionStatus.state === 'disconnected' ? theme.colors.textSecondary : sessionStatus.isConnected ? theme.colors.success : sessionStatus.statusColor,
                                fontWeight: '500',
                                ...Typography.default()
                            }}>
                                {sessionStatus.statusText}
                            </Text>
                        </View>
                        <View style={{
                            marginTop: 10,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 10,
                            backgroundColor: theme.colors.surfaceHigh,
                            borderWidth: 1,
                            borderColor: theme.colors.divider,
                        }}>
                            <Text style={{
                                fontSize: 13,
                                color: theme.colors.textSecondary,
                                fontWeight: '600',
                                ...Typography.default('semiBold'),
                            }}>
                                {agentLabel}
                            </Text>
                        </View>
                    </View>
                </View>

                {!!archiveLifecycleVisual && !!archiveLifecycleLabel && (
                    <View
                        accessible={archiveLifecycleVisual.accessible}
                        accessibilityRole="text"
                        accessibilityLiveRegion={archiveLifecycleVisual.accessibilityLiveRegion}
                        accessibilityLabel={archiveLifecycleLabel}
                        style={{
                            maxWidth: layout.maxWidth,
                            alignSelf: 'center',
                            width: '100%',
                            paddingHorizontal: 16,
                            marginBottom: 8,
                        }}
                    >
                        <View style={{
                            minHeight: 48,
                            paddingHorizontal: 14,
                            paddingVertical: 11,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: archiveLifecycleVisual.tone === 'warning' ? theme.colors.warning : theme.colors.divider,
                            backgroundColor: archiveLifecycleVisual.tone === 'warning' ? theme.colors.accentSoft : theme.colors.surface,
                            flexDirection: 'row',
                            alignItems: 'center',
                        }}>
                            <Ionicons
                                name={archiveLifecycleVisual.icon}
                                size={20}
                                color={archiveLifecycleVisual.tone === 'warning' ? theme.colors.warning : theme.colors.textSecondary}
                            />
                            <Text style={{
                                marginLeft: 10,
                                color: theme.colors.text,
                                fontSize: 15,
                                ...Typography.default('semiBold'),
                            }}>
                                {archiveLifecycleLabel}
                            </Text>
                        </View>
                    </View>
                )}

                {/* CLI Version Warning */}
                {isCliOutdated && (
                    <ItemGroup>
                        <Item
                            title={t('sessionInfo.cliVersionOutdated')}
                            subtitle={t('sessionInfo.updateCliInstructions')}
                            icon={<Ionicons name="warning-outline" size={29} color="#FF9500" />}
                            showChevron={false}
                            onPress={handleCopyUpdateCommand}
                        />
                    </ItemGroup>
                )}

                {/* Session Details */}
                <ItemGroup>
                    <Item
                        title={t('sessionInfo.agentHubSessionId')}
                        subtitle={`${session.id.substring(0, 8)}...${session.id.substring(session.id.length - 8)}`}
                        icon={<Ionicons name="finger-print-outline" size={29} color="#007AFF" />}
                        onPress={handleCopySessionId}
                    />
                    {session.metadata?.claudeSessionId && (
                        <Item
                            title={t('sessionInfo.claudeCodeSessionId')}
                            subtitle={`${session.metadata.claudeSessionId.substring(0, 8)}...${session.metadata.claudeSessionId.substring(session.metadata.claudeSessionId.length - 8)}`}
                            icon={<Ionicons name="code-outline" size={29} color="#9C27B0" />}
                            onPress={async () => {
                                try {
                                    await Clipboard.setStringAsync(session.metadata!.claudeSessionId!);
                                    Modal.alert(t('common.success'), t('sessionInfo.claudeCodeSessionIdCopied'));
                                } catch (error) {
                                    Modal.alert(t('common.error'), t('sessionInfo.failedToCopyClaudeCodeSessionId'));
                                }
                            }}
                        />
                    )}
                    {session.metadata?.codexThreadId && (
                        <Item
                            title={t('sessionInfo.codexThreadId')}
                            subtitle={`${session.metadata.codexThreadId.substring(0, 8)}...${session.metadata.codexThreadId.substring(session.metadata.codexThreadId.length - 8)}`}
                            icon={<Ionicons name="terminal-outline" size={29} color="#10A37F" />}
                            onPress={async () => {
                                try {
                                    await Clipboard.setStringAsync(session.metadata!.codexThreadId!);
                                    Modal.alert(t('common.success'), t('sessionInfo.codexThreadIdCopied'));
                                } catch (error) {
                                    Modal.alert(t('common.error'), t('sessionInfo.failedToCopyCodexThreadId'));
                                }
                            }}
                        />
                    )}
                    {/* Resume command — shown for disconnected sessions with a backend session ID */}
                    {/* TODO: migrate to `agenthub resume <agenthub-session-id>` once it works without agenthub-agent auth */}
                    {!sessionStatus.isConnected && getResumeCommand(session) && (
                        <CopyableItem
                            title="Resume Command"
                            subtitle={getResumeCommand(session)!}
                            icon={<Ionicons name="play-circle-outline" size={29} color="#30D158" />}
                            copyText={getResumeCommand(session)!}
                        />
                    )}
                    <Item
                        title={t('sessionInfo.connectionStatus')}
                        detail={sessionStatus.isConnected ? t('status.online') : t('status.offline')}
                        icon={<Ionicons name="pulse-outline" size={29} color={sessionStatus.isConnected ? "#34C759" : "#8E8E93"} />}
                        showChevron={false}
                    />
                    <Item
                        title={t('sessionInfo.created')}
                        subtitle={formatDate(session.createdAt)}
                        icon={<Ionicons name="calendar-outline" size={29} color="#007AFF" />}
                        showChevron={false}
                    />
                    <Item
                        title={t('sessionInfo.lastUpdated')}
                        subtitle={formatDate(session.updatedAt)}
                        icon={<Ionicons name="time-outline" size={29} color="#007AFF" />}
                        showChevron={false}
                    />
                    <Item
                        title={t('sessionInfo.sequence')}
                        detail={session.seq.toString()}
                        icon={<Ionicons name="git-commit-outline" size={29} color="#007AFF" />}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Quick Actions */}
                <ItemGroup title={t('sessionInfo.quickActions')}>
                    {session.metadata?.machineId && (
                        <Item
                            title={t('sessionInfo.viewMachine')}
                            subtitle={t('sessionInfo.viewMachineSubtitle')}
                            icon={<Ionicons name="server-outline" size={29} color="#007AFF" />}
                            onPress={() => router.push(`/machine/${session.metadata?.machineId}`)}
                        />
                    )}
                    {canShowResume && (
                        <Item
                            title={t('sessionInfo.resumeSession')}
                            subtitle={resumeSessionSubtitle}
                            icon={<Ionicons name="play-circle-outline" size={29} color="#007AFF" />}
                            onPress={resumeSession}
                        />
                    )}
                    {canMerge && (
                        <Item
                            title={t('sessionInfo.mergeWorktree')}
                            subtitle={t('sessionInfo.mergeWorktreeSubtitle')}
                            icon={<Ionicons name="git-merge-outline" size={29} color="#34C759" />}
                            onPress={mergeWorktreeAction}
                            loading={mergingWorktree}
                            disabled={archivingSession || deletingSession}
                        />
                    )}
                    <Item
                        title={t('sessionInfo.archiveSession')}
                        subtitle={t('sessionInfo.archiveSessionSubtitle')}
                        icon={<Ionicons name="archive-outline" size={29} color="#FF9500" />}
                        onPress={handleArchiveSession}
                        loading={archivingSession}
                        disabled={deletingSession}
                    />
                </ItemGroup>

                <ItemGroup title={t('settingsAccount.dangerZone')}>
                    <Item
                        title={t('sessionInfo.deleteSession')}
                        subtitle={t('sessionInfo.deleteSessionSubtitle')}
                        icon={<Ionicons name="trash-outline" size={29} color="#FF3B30" />}
                        onPress={handleDeleteSession}
                        loading={deletingSession}
                        disabled={archivingSession}
                    />
                </ItemGroup>

                {/* Metadata */}
                {session.metadata && (
                    <ItemGroup title={t('sessionInfo.metadata')}>
                        <Item
                            title={t('sessionInfo.host')}
                            subtitle={session.metadata.host}
                            icon={<Ionicons name="desktop-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        <Item
                            title={t('sessionInfo.path')}
                            subtitle={formatPathRelativeToHome(session.metadata.path, session.metadata.homeDir)}
                            icon={<Ionicons name="folder-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        {session.metadata.version && (
                            <Item
                                title={t('sessionInfo.cliVersion')}
                                subtitle={session.metadata.version}
                                detail={isCliOutdated ? '⚠️' : undefined}
                                icon={<Ionicons name="git-branch-outline" size={29} color={isCliOutdated ? "#FF9500" : "#5856D6"} />}
                                showChevron={false}
                            />
                        )}
                        {session.metadata.os && (
                            <Item
                                title={t('sessionInfo.operatingSystem')}
                                subtitle={formatOSPlatform(session.metadata.os)}
                                icon={<Ionicons name="hardware-chip-outline" size={29} color="#5856D6" />}
                                showChevron={false}
                            />
                        )}
                        <Item
                            title={t('sessionInfo.aiProvider')}
                            subtitle={(() => {
                                const flavor = session.metadata.flavor || 'claude';
                                if (flavor === 'gpt' || flavor === 'openai') return CLIENT_AGENT_LABELS.codex;
                                if (isSupportedClientAgent(flavor)) return CLIENT_AGENT_LABELS[flavor];
                                return t('status.unknown');
                            })()}
                            icon={<Ionicons name="sparkles-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        <Item
                            title="Sandbox"
                            subtitle={formatSandboxMetadata(session.metadata.sandbox, session.metadata.homeDir)}
                            icon={<Ionicons name="shield-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        <Item
                            title="Dangerously Skip Permissions"
                            subtitle={formatDangerouslySkipPermissionsMetadata(
                                session.metadata.dangerouslySkipPermissions,
                                session.metadata.flavor,
                                session.permissionMode,
                                session.metadata.sandbox,
                            )}
                            icon={<Ionicons name="warning-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        {session.metadata.hostPid && (
                            <Item
                                title={t('sessionInfo.processId')}
                                subtitle={session.metadata.hostPid.toString()}
                                icon={<Ionicons name="terminal-outline" size={29} color="#5856D6" />}
                                showChevron={false}
                            />
                        )}
                        {session.metadata.agentHubHomeDir && (
                            <Item
                                title={t('sessionInfo.agenthubHome')}
                                subtitle={formatPathRelativeToHome(session.metadata.agentHubHomeDir, session.metadata.homeDir)}
                                icon={<Ionicons name="home-outline" size={29} color="#5856D6" />}
                                showChevron={false}
                            />
                        )}
                        <Item
                            title={t('sessionInfo.copyMetadata')}
                            icon={<Ionicons name="copy-outline" size={29} color="#007AFF" />}
                            onPress={handleCopyMetadata}
                        />
                        <Item
                            title={t('sessionInfo.copyMetadata') + '\n& Client Logs'}
                            icon={<Ionicons name="document-text-outline" size={29} color="#007AFF" />}
                            onPress={handleCopyMetadataAndLogs}
                        />
                    </ItemGroup>
                )}

                {/* Agent State */}
                {session.agentState && (
                    <ItemGroup title={t('sessionInfo.agentState')}>
                        <Item
                            title={t('sessionInfo.controlledByUser')}
                            detail={session.agentState.controlledByUser ? t('common.yes') : t('common.no')}
                            icon={<Ionicons name="person-outline" size={29} color="#FF9500" />}
                            showChevron={false}
                        />
                        {session.agentState.requests && Object.keys(session.agentState.requests).length > 0 && (
                            <Item
                                title={t('sessionInfo.pendingRequests')}
                                detail={Object.keys(session.agentState.requests).length.toString()}
                                icon={<Ionicons name="hourglass-outline" size={29} color="#FF9500" />}
                                showChevron={false}
                            />
                        )}
                    </ItemGroup>
                )}

                {/* Activity */}
                <ItemGroup title={t('sessionInfo.activity')}>
                    <Item
                        title={t('sessionInfo.thinking')}
                        detail={session.thinking ? t('common.yes') : t('common.no')}
                        icon={<Ionicons name="bulb-outline" size={29} color={session.thinking ? "#FFCC00" : "#8E8E93"} />}
                        showChevron={false}
                    />
                    {session.thinking && (
                        <Item
                            title={t('sessionInfo.thinkingSince')}
                            subtitle={formatDate(session.thinkingAt)}
                            icon={<Ionicons name="timer-outline" size={29} color="#FFCC00" />}
                            showChevron={false}
                        />
                    )}
                </ItemGroup>

                {/* Raw JSON (Dev Mode Only) */}
                {devModeEnabled && (
                    <ItemGroup title="Raw JSON (Dev Mode)">
                        {session.agentState && (
                            <>
                                <Item
                                    title="Agent State"
                                    icon={<Ionicons name="code-working-outline" size={29} color="#FF9500" />}
                                    showChevron={false}
                                />
                                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                                    <CodeView
                                         code={JSON.stringify(session.agentState, null, 2)}
                                         language="json"
                                         accessibilityLabel={t('sessionInfo.agentState')}
                                     />
                                </View>
                            </>
                        )}
                        {session.metadata && (
                            <>
                                <Item
                                    title="Metadata"
                                    icon={<Ionicons name="information-circle-outline" size={29} color="#5856D6" />}
                                    showChevron={false}
                                />
                                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                                    <CodeView
                                         code={JSON.stringify(session.metadata, null, 2)}
                                         language="json"
                                         accessibilityLabel={t('sessionInfo.metadata')}
                                     />
                                </View>
                            </>
                        )}
                        {sessionStatus && (
                            <>
                                <Item
                                    title="Session Status"
                                    icon={<Ionicons name="analytics-outline" size={29} color="#007AFF" />}
                                    showChevron={false}
                                />
                                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                                    <CodeView
                                         code={JSON.stringify({
                                            isConnected: sessionStatus.isConnected,
                                            statusText: sessionStatus.statusText,
                                            statusColor: sessionStatus.statusColor,
                                            statusDotColor: sessionStatus.statusDotColor,
                                            isPulsing: sessionStatus.isPulsing
                                         }, null, 2)}
                                         language="json"
                                         accessibilityLabel={t('sessionInfo.connectionStatus')}
                                     />
                                </View>
                            </>
                        )}
                        {/* Full Session Object */}
                        <Item
                            title="Full Session Object"
                            icon={<Ionicons name="document-text-outline" size={29} color="#34C759" />}
                            showChevron={false}
                        />
                        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                            <CodeView
                                 code={JSON.stringify(session, null, 2)}
                                 language="json"
                                 accessibilityLabel={`${sessionName} · ${t('sessionInfo.metadata')}`}
                             />
                        </View>
                    </ItemGroup>
                )}
            </ItemList>
        </>
    );
}

export default React.memo(() => {
    const { theme } = useUnistyles();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { session, isLoading: isEnsuringSession } = useEnsureSessionLoaded(id);
    const isDataReady = useIsDataReady();

    // Handle three states: loading, deleted, and exists
    if (!isDataReady || isEnsuringSession) {
        // Still loading data
        return (
            <View role="main" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ScreenReaderHeading title={t('common.loading')} />
                <Ionicons name="hourglass-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.textSecondary, fontSize: 17, marginTop: 16, ...Typography.default('semiBold') }}>{t('common.loading')}</Text>
            </View>
        );
    }

    if (!session) {
        // Session has been deleted or doesn't exist
        return (
            <View role="main" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ScreenReaderHeading title={t('errors.sessionDeleted')} />
                <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16, ...Typography.default('semiBold') }}>{t('errors.sessionDeleted')}</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 32, ...Typography.default() }}>{t('errors.sessionDeletedDescription')}</Text>
            </View>
        );
    }

    return <SessionInfoContent session={session} />;
});

function CopyableItem({ title, subtitle, icon, copyText }: { title: string; subtitle: string; icon: React.ReactNode; copyText: string }) {
    const [copied, setCopied] = React.useState(false);
    return (
        <Item
            title={title}
            subtitle={subtitle}
            icon={icon}
            showChevron={false}
            rightElement={<Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? '#30D158' : '#8E8E93'} />}
            onPress={async () => {
                await Clipboard.setStringAsync(copyText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
        />
    );
}
