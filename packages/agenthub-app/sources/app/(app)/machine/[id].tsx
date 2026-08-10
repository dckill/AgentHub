import React, { useState, useMemo } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Typography } from '@/constants/Typography';
import { useSessions, useMachine, useSettingMutable, useIsDataReady } from '@/sync/storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import Octicons from '@expo/vector-icons/Octicons';
import type { Session } from '@/sync/storageTypes';
import { machineCheckCliUpdate, machineStopDaemon, machineUpdateCli, machineUpdateMetadata, machineDelete } from '@/sync/ops';
import { Modal } from '@/modal';
import { getSessionName, getSessionSubtitle } from '@/utils/sessionUtils';
import { isMachineOnline } from '@/utils/machineUtils';
import { sync } from '@/sync/sync';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import {
    getMachineDetailDaemonStatus,
    openNewSessionForMachine,
    removeMachineFromGroups,
} from '@/utils/machineDetail';
import { useFileTransferStore } from '@/sync/fileTransferStore';
import { buildTransferSummary, getMachineTransferBadge } from '@/utils/fileTransfers';
import { FileTransferBadge } from '@/components/FileTransferBadge';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { ScreenReaderHeading } from '@/components/ScreenReaderHeading';
import { getMachineCliUpdateView } from '@/utils/cliUpdate';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { MachineSystemOverview } from '@/components/MachineSystemOverview';

export default function MachineDetailScreen() {
    const { theme } = useUnistyles();
    const { id: machineId } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const sessions = useSessions();
    const machine = useMachine(machineId!);
    const isDataReady = useIsDataReady();
    const navigateToSession = useNavigateToSession();
    const [machineGroups, setMachineGroups] = useSettingMutable('machineGroups');
    const [isStoppingDaemon, setIsStoppingDaemon] = useState(false);
    const [isRenamingMachine, setIsRenamingMachine] = useState(false);
    const [isDeletingMachine, setIsDeletingMachine] = useState(false);
    const [isUpdatingCli, setIsUpdatingCli] = useState(false);
    const transferTasks = useFileTransferStore(state => state.tasks);

    const machineSessions = useMemo(() => {
        if (!sessions || !machineId) return [];

        return sessions.filter(item => {
            if (typeof item === 'string') return false;
            const session = item as Session;
            return session.metadata?.machineId === machineId;
        }) as Session[];
    }, [sessions, machineId]);

    const previousSessions = useMemo(() => {
        return [...machineSessions]
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .slice(0, 5);
    }, [machineSessions]);

    const daemonStatus = useMemo(() => {
        return getMachineDetailDaemonStatus(machine);
    }, [machine]);

    const machineTransferSummary = useMemo(() => {
        if (!machineId) return null;
        return buildTransferSummary(transferTasks).byMachine[machineId] ?? null;
    }, [machineId, transferTasks]);

    const machineTransferBadge = useMemo(() => {
        return getMachineTransferBadge(machineTransferSummary);
    }, [machineTransferSummary]);

    const cliUpdate = useMemo(() => machine ? getMachineCliUpdateView(machine) : null, [machine]);

    const handleCliUpdateAction = async () => {
        if (!machineId || !cliUpdate || !machineOnline) return;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;
        setIsUpdatingCli(true);
        try {
            if (cliUpdate.needsUpdate) {
                const confirmed = await runSessionActionRequest({
                    isCurrent,
                    request: () => Modal.confirm(
                        t('updateBanner.updateAvailable'),
                        `${cliUpdate.currentVersion ?? t('status.unknown')} → ${cliUpdate.latestVersion ?? t('status.unknown')}`,
                        { cancelText: t('common.cancel'), confirmText: t('common.continue') },
                    ),
                });
                if (!isCurrent() || !confirmed) return;
                const result = await runSessionActionRequest({
                    isCurrent,
                    request: () => machineUpdateCli(machineId, cliUpdate.latestVersion),
                });
                if (!isCurrent() || !result) return;
                if (!result.accepted) {
                    Modal.alert(t('common.error'), result.message || result.status.error || t('settings.updateCheckFailed'));
                }
            } else {
                await runSessionActionRequest({
                    isCurrent,
                    request: () => machineCheckCliUpdate(machineId),
                });
            }
        } catch (error) {
            if (isCurrent()) {
                Modal.alert(t('common.error'), error instanceof Error ? error.message : t('settings.updateCheckFailed'));
            }
        } finally {
            if (isCurrent()) setIsUpdatingCli(false);
        }
    };

    const handleStopDaemon = async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;
        // Show confirmation modal using alert with buttons
        Modal.alert(
            t('machine.stopDaemonTitle'),
            t('machine.stopDaemonMessage'),
            [
                {
                    text: t('common.cancel'),
                    style: 'cancel'
                },
                {
                    text: t('machine.stopDaemon'),
                    style: 'destructive',
                    onPress: async () => {
                        if (!isCurrent()) return;
                        setIsStoppingDaemon(true);
                        try {
                            const result = await runSessionActionRequest({
                                isCurrent,
                                request: () => machineStopDaemon(machineId!),
                            });
                            if (!isCurrent() || !result) return;
                            Modal.alert(t('machine.daemonStopped'), result.message);
                            // Refresh to get updated metadata
                            await runSessionActionRequest({
                                isCurrent,
                                request: () => sync.refreshMachines(),
                            });
                        } catch (error) {
                            if (isCurrent()) Modal.alert(t('common.error'), t('machine.stopDaemonFailed'));
                        } finally {
                            if (isCurrent()) setIsStoppingDaemon(false);
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteMachine = async () => {
        if (!machineId) return;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;
        const confirmed = await runSessionActionRequest({
            isCurrent,
            request: () => Modal.confirm(
                t('machine.deleteConfirmTitle'),
                t('machine.deleteConfirmMessage'),
                { cancelText: t('common.cancel'), confirmText: t('common.delete'), destructive: true }
            ),
        });
        if (!isCurrent() || !confirmed) return;

        setIsDeletingMachine(true);
        try {
            const result = await runSessionActionRequest({
                isCurrent,
                request: () => machineDelete(machineId),
            });
            if (!isCurrent() || !result) return;
            if (result.success) {
                const nextMachineGroups = removeMachineFromGroups(machineGroups, machineId);
                if (nextMachineGroups !== machineGroups) {
                    setMachineGroups(nextMachineGroups);
                }
                router.back();
            } else {
                Modal.alert(t('common.error'), result.message || t('machine.deleteFailed'));
            }
        } catch (error) {
            if (isCurrent()) {
                Modal.alert(
                    t('common.error'),
                    error instanceof Error ? error.message : t('machine.deleteFailed')
                );
            }
        } finally {
            if (isCurrent()) setIsDeletingMachine(false);
        }
    };

    const handleRenameMachine = async () => {
        if (!machine || !machineId) return;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;

        const newDisplayName = await runSessionActionRequest({
            isCurrent,
            request: () => Modal.prompt(
                t('machine.renameTitle'),
                t('machine.renameMessage'),
                {
                    defaultValue: machine.metadata?.displayName || '',
                    placeholder: machine.metadata?.host || t('machine.renamePlaceholder'),
                    cancelText: t('common.cancel'),
                    confirmText: t('common.rename')
                }
            ),
        });

        if (isCurrent() && newDisplayName !== null) {
            setIsRenamingMachine(true);
            try {
                const updatedMetadata = {
                    ...machine.metadata!,
                    displayName: newDisplayName.trim() || undefined
                };

                await runSessionActionRequest({
                    isCurrent,
                    request: () => machineUpdateMetadata(
                        machineId,
                        updatedMetadata,
                        machine.metadataVersion
                    ),
                });
                if (!isCurrent()) return;

                Modal.alert(t('common.success'), t('machine.renameSuccess'));
            } catch (error) {
                if (isCurrent()) {
                    Modal.alert(
                        t('common.error'),
                        error instanceof Error ? error.message : t('machine.renameFailed')
                    );
                }
                // Refresh to get latest state
                if (isCurrent()) {
                    await runSessionActionRequest({
                        isCurrent,
                        request: () => sync.refreshMachines(),
                    });
                }
            } finally {
                if (isCurrent()) setIsRenamingMachine(false);
            }
        }
    };

    const handleOpenNewSession = () => {
        if (!machine || !machineId) return;
        if (!isMachineOnline(machine)) return;
        openNewSessionForMachine({
            draft: useNewSessionDraft.getState(),
            router,
            machineId,
        });
    };

    if (!machine) {
        return (
            <>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: '',
                        headerBackTitle: t('machine.back')
                    }}
                />
                <View role="main" style={styles.missingState}>
                    <ScreenReaderHeading title={isDataReady ? t('machine.notFound') : t('common.loading')} />
                    {!isDataReady ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : null}
                    <Text accessibilityLiveRegion="polite" style={[Typography.default(), { fontSize: 16, color: theme.colors.textSecondary }]}>
                        {isDataReady ? t('machine.notFound') : t('common.loading')}
                    </Text>
                    {isDataReady ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.stateButton}>
                            <Text style={styles.stateButtonText}>{t('common.back')}</Text>
                        </Pressable>
                    ) : null}
                </View>
            </>
        );
    }

    const metadata = machine.metadata;
    const machineName = metadata?.displayName || metadata?.host || t('status.unknown');

    const machineOnline = isMachineOnline(machine);

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: () => (
                        <View style={{ alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons
                                    name="desktop-outline"
                                    size={18}
                                    color={theme.colors.header.tint}
                                    style={{ marginRight: 6 }}
                                />
                                <Text style={[Typography.default('semiBold'), { fontSize: 17, color: theme.colors.header.tint }]}>
                                    {machineName}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                <View style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: isMachineOnline(machine) ? theme.colors.success : '#999',
                                    marginRight: 4
                                }} />
                                <Text style={[Typography.default(), {
                                    fontSize: 12,
                                    color: isMachineOnline(machine) ? theme.colors.success : '#999'
                                }]}>
                                    {isMachineOnline(machine) ? t('status.online') : t('status.offline')}
                                </Text>
                            </View>
                        </View>
                    ),
                    headerRight: () => (
                        <Pressable
                            onPress={handleRenameMachine}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel={t('machine.renameTitle')}
                            accessibilityState={{ disabled: isRenamingMachine, busy: isRenamingMachine }}
                            style={[styles.headerAction, { opacity: isRenamingMachine ? 0.5 : 1 }]}
                            disabled={isRenamingMachine}
                        >
                            <Octicons
                                name="pencil"
                                size={24}
                                color={theme.colors.text}
                            />
                        </Pressable>
                    ),
                    headerBackTitle: t('machine.back')
                }}
            />
            <View role="main" style={styles.page}>
                <ScreenReaderHeading title={machineName} />
                <ItemList keyboardShouldPersistTaps="handled">
                <MachineSystemOverview
                    machineId={machineId!}
                    online={machineOnline}
                    refreshIntervalMs={3_000}
                />
                {!machineOnline && (
                    <ItemGroup>
                        <Item
                            title={t('machine.offlineUnableToSpawn')}
                            subtitle={t('machine.offlineHelp')}
                            subtitleLines={0}
                            showChevron={false}
                        />
                    </ItemGroup>
                )}

                <ItemGroup title={t('machine.statusAndProperties')}>
                    <Item
                        title={t('machine.status')}
                        detail={machineOnline ? t('status.online') : t('status.offline')}
                        detailStyle={{
                            color: machineOnline ? theme.colors.success : '#999'
                        }}
                        showChevron={false}
                    />
                    <Item
                        title={t('machine.daemon')}
                        detail={daemonStatus}
                        detailStyle={{
                            color: daemonStatus === 'likely alive' ? theme.colors.success : '#FF9500'
                        }}
                        showChevron={false}
                    />
                    <Item
                        title={t('machine.host')}
                        subtitle={metadata?.host || machineId}
                    />
                    <Item
                        title={t('machine.machineId')}
                        subtitle={machineId}
                        subtitleStyle={{ fontFamily: 'Menlo', fontSize: 12 }}
                    />
                    {metadata?.username && (
                        <Item
                            title={t('machine.username')}
                            subtitle={metadata.username}
                        />
                    )}
                    {metadata?.homeDir && (
                        <Item
                            title={t('machine.homeDirectory')}
                            subtitle={metadata.homeDir}
                            subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                        />
                    )}
                    {metadata?.platform && (
                        <Item
                            title={t('machine.platform')}
                            subtitle={metadata.platform}
                        />
                    )}
                    {metadata?.arch && (
                        <Item
                            title={t('machine.architecture')}
                            subtitle={metadata.arch}
                        />
                    )}
                    <Item
                        title={t('machine.lastSeen')}
                        subtitle={machine.activeAt ? new Date(machine.activeAt).toLocaleString() : t('machine.never')}
                    />
                    <Item
                        title={t('machine.metadataVersion')}
                        subtitle={String(machine.metadataVersion)}
                    />
                </ItemGroup>

                {cliUpdate ? (
                    <ItemGroup title={t('machine.cliVersion')}>
                        <Item
                            title={t('common.version')}
                            subtitle={cliUpdate.currentVersion || t('status.unknown')}
                            subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                            showChevron={false}
                        />
                        {cliUpdate.latestVersion ? (
                            <Item
                                title={t('updateBanner.updateAvailable')}
                                subtitle={cliUpdate.latestVersion}
                                subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                                showChevron={false}
                            />
                        ) : null}
                        <Item
                            title={
                                cliUpdate.phase === 'checking' ? t('updateBanner.checkingForUpdate')
                                    : cliUpdate.phase === 'updating' ? t('updateBanner.downloadingUpdate')
                                        : cliUpdate.phase === 'restarting' ? t('updateBanner.updateReady')
                                            : cliUpdate.phase === 'available' ? t('updateBanner.updateAvailable')
                                                : cliUpdate.phase === 'up-to-date' ? t('settings.noUpdatesAvailable')
                                                    : cliUpdate.phase === 'failed' ? t('settings.updateCheckFailed')
                                                        : t('settings.updateCheckUnavailable')
                            }
                            subtitle={cliUpdate.error || cliUpdate.unsupportedReason}
                            subtitleLines={0}
                            showChevron={false}
                            leftElement={cliUpdate.isBusy || isUpdatingCli
                                ? <ActivityIndicator size="small" color={theme.colors.warning} />
                                : <Ionicons
                                    name={cliUpdate.needsUpdate ? 'cloud-download-outline' : cliUpdate.phase === 'failed' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                                    size={20}
                                    color={cliUpdate.tone === 'error' ? theme.colors.status.error : cliUpdate.needsUpdate ? theme.colors.warning : theme.colors.textSecondary}
                                />}
                        />
                        {cliUpdate.phase !== 'unsupported' ? (
                            <Item
                                title={cliUpdate.needsUpdate ? t('updateBanner.updateAvailable') : t('settings.checkForUpdates')}
                                subtitle={cliUpdate.needsUpdate ? `${cliUpdate.currentVersion} → ${cliUpdate.latestVersion}` : t('settings.checkForUpdatesSubtitle')}
                                onPress={cliUpdate.needsUpdate
                                    ? (cliUpdate.canStartUpdate && !isUpdatingCli ? handleCliUpdateAction : undefined)
                                    : (machineOnline && !cliUpdate.isBusy && !isUpdatingCli ? handleCliUpdateAction : undefined)}
                                disabled={isUpdatingCli || cliUpdate.isBusy || (cliUpdate.needsUpdate ? !cliUpdate.canStartUpdate : !machineOnline)}
                                rightElement={<Ionicons name="refresh-outline" size={20} color={theme.colors.warning} />}
                            />
                        ) : null}
                    </ItemGroup>
                ) : null}

                <ItemGroup title={t('machine.actions')}>
                    <Item
                        title={t('machine.startSessionOnThisMachine')}
                        subtitle={machineOnline ? t('machine.startSessionOnThisMachineSubtitle') : t('machine.startSessionOfflineSubtitle')}
                        leftElement={<Ionicons name="sparkles-outline" size={20} color={machineOnline ? theme.colors.textSecondary : '#999'} />}
                        onPress={machineOnline ? handleOpenNewSession : undefined}
                        disabled={!machineOnline}
                    />
                    <Item
                        title={t('fileBrowser.title')}
                        subtitle={isMachineOnline(machine) ? t('fileBrowser.browseOnline') : t('fileBrowser.browseOffline')}
                        leftElement={<Ionicons name="folder-open-outline" size={20} color={isMachineOnline(machine) ? theme.colors.textSecondary : '#999'} />}
                        onPress={isMachineOnline(machine) ? () => router.push(`/machine/${machineId}/files` as any) : undefined}
                        disabled={!isMachineOnline(machine)}
                    />
                    {!machineTransferSummary || machineTransferSummary.totalCount === 0 ? (
                        <Item
                            title={t('fileBrowser.noTransfers')}
                            subtitle={t('fileBrowser.noTransfersSubtitle')}
                            showChevron={false}
                        />
                    ) : (
                        <>
                            <Item
                                title={t('fileBrowser.viewAllTransfers')}
                                subtitle={t('fileBrowser.transferSummary', { active: machineTransferSummary.activeCount, failed: machineTransferSummary.failedCount, paused: machineTransferSummary.pausedCount })}
                                onPress={() => router.push(`/transfers?machineId=${encodeURIComponent(machineId!)}` as any)}
                                rightElement={<FileTransferBadge badge={machineTransferBadge} />}
                            />
                            {machineTransferSummary.failedCount > 0 && (
                                <Item
                                    title={t('fileBrowser.failedTasks')}
                                    detail={String(machineTransferSummary.failedCount)}
                                    detailStyle={{ color: theme.colors.status.error }}
                                    onPress={() => router.push(`/transfers?machineId=${encodeURIComponent(machineId!)}&status=failed` as any)}
                                />
                            )}
                            {machineTransferSummary.activeCount > 0 && (
                                <Item
                                    title={t('fileBrowser.downloadingTasks')}
                                    detail={String(machineTransferSummary.activeCount)}
                                    detailStyle={{ color: theme.colors.textLink }}
                                    onPress={() => router.push(`/transfers?machineId=${encodeURIComponent(machineId!)}&status=active` as any)}
                                />
                            )}
                            {machineTransferSummary.pausedCount > 0 && (
                                <Item
                                    title={t('fileBrowser.pausedTasks')}
                                    detail={String(machineTransferSummary.pausedCount)}
                                    onPress={() => router.push(`/transfers?machineId=${encodeURIComponent(machineId!)}&status=paused` as any)}
                                />
                            )}
                        </>
                    )}
                </ItemGroup>

                {/* Daemon */}
                <ItemGroup title={t('machine.daemon')}>
                        <Item
                            title={t('machine.stopDaemon')}
                            titleStyle={{
                                color: daemonStatus === 'stopped' ? '#999' : '#FF9500'
                            }}
                            onPress={daemonStatus === 'stopped' ? undefined : handleStopDaemon}
                            disabled={isStoppingDaemon || daemonStatus === 'stopped'}
                            rightElement={
                                isStoppingDaemon ? (
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                ) : (
                                    <Ionicons
                                        name="stop-circle"
                                        size={20}
                                        color={daemonStatus === 'stopped' ? '#999' : '#FF9500'}
                                    />
                                )
                            }
                        />
                        {machine.daemonState && (
                            <>
                                {machine.daemonState.pid && (
                                    <Item
                                        title={t('machine.lastKnownPid')}
                                        subtitle={String(machine.daemonState.pid)}
                                        subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                                    />
                                )}
                                {machine.daemonState.httpPort && (
                                    <Item
                                        title={t('machine.lastKnownHttpPort')}
                                        subtitle={String(machine.daemonState.httpPort)}
                                        subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                                    />
                                )}
                                {machine.daemonState.startTime && (
                                    <Item
                                        title={t('machine.startedAt')}
                                        subtitle={new Date(machine.daemonState.startTime).toLocaleString()}
                                    />
                                )}
                                {machine.daemonState.startedWithCliVersion && (
                                    <Item
                                        title={t('machine.cliVersion')}
                                        subtitle={machine.daemonState.startedWithCliVersion}
                                        subtitleStyle={{ fontFamily: 'Menlo', fontSize: 13 }}
                                    />
                                )}
                            </>
                        )}
                        <Item
                            title={t('machine.daemonStateVersion')}
                            subtitle={String(machine.daemonStateVersion)}
                        />
                </ItemGroup>

                {/* CLI Availability */}
                {metadata?.cliAvailability && (
                    <ItemGroup title={t('machine.cliAvailability')}>
                        <Item
                            title="Claude"
                            showChevron={false}
                            rightElement={
                                <Text style={{ color: metadata.cliAvailability.claude ? theme.colors.success : theme.colors.textSecondary, fontSize: 14 }}>
                                    {metadata.cliAvailability.claude ? t('machine.cliInstalled') : t('machine.cliNotFound')}
                                </Text>
                            }
                        />
                        <Item
                            title="Codex"
                            showChevron={false}
                            rightElement={
                                <Text style={{ color: metadata.cliAvailability.codex ? theme.colors.success : theme.colors.textSecondary, fontSize: 14 }}>
                                    {metadata.cliAvailability.codex ? t('machine.cliInstalled') : t('machine.cliNotFound')}
                                </Text>
                            }
                        />
                        <Item
                            title={t('machine.lastDetected')}
                            subtitle={new Date(metadata.cliAvailability.detectedAt).toLocaleString()}
                            showChevron={false}
                        />
                    </ItemGroup>
                )}

                {/* Previous Sessions (debug view) */}
                {previousSessions.length > 0 && (
                    <ItemGroup title={t('machine.previousSessions')}>
                        {previousSessions.map(session => (
                            <Item
                                key={session.id}
                                title={getSessionName(session)}
                                subtitle={getSessionSubtitle(session)}
                                onPress={() => navigateToSession(session.id)}
                                rightElement={<Ionicons name="chevron-forward" size={20} color="#C7C7CC" />}
                            />
                        ))}
                    </ItemGroup>
                )}

                {/* Danger zone */}
                <ItemGroup title={t('machine.dangerZone')} footer={t('machine.deleteFooter')}>
                    <Item
                        title={t('machine.delete')}
                        titleStyle={{ color: '#FF3B30' }}
                        onPress={handleDeleteMachine}
                        disabled={isDeletingMachine}
                        showChevron={false}
                        rightElement={
                            isDeletingMachine ? (
                                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                            ) : (
                                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                            )
                        }
                    />
                </ItemGroup>
                </ItemList>
            </View>
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
    page: {
        flex: 1,
    },
    missingState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 24,
    },
    headerAction: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stateButton: {
        minWidth: 88,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: theme.colors.button.primary.background,
    },
    stateButtonText: {
        color: theme.colors.button.primary.tint,
        ...Typography.default('semiBold'),
    },
}));
