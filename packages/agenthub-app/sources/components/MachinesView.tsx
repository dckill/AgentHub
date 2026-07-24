import * as React from 'react';
import { ActivityIndicator, View, Pressable, Text, Platform, useWindowDimensions } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useAllMachines, useIsDataReady, useSettingMutable, useSocketStatus } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { Modal } from '@/modal';
import { t } from '@/text';
import { Typography } from '@/constants/Typography';
import { ActionMenu, ActionMenuAnchor, ActionMenuItem } from '@/components/ActionMenu';
import {
    appendMachineGroupOrderIfMissing,
    buildMachineGroupPickerOptions,
    buildMachineGroups,
    getOrderedMachineGroupNames,
    moveMachineGroupOrderItem,
    NEW_MACHINE_GROUP_KEY,
    UNGROUPED_MACHINE_GROUP_KEY,
} from '@/utils/machineGroups';
import { getVisibleDeviceMachines } from '@/utils/machineActions';
import { useDeviceScale } from '@/hooks/useScale';
import { FileTransferBadge } from '@/components/FileTransferBadge';
import { useFileTransferStore } from '@/sync/fileTransferStore';
import { buildTransferSummary, getMachineTransferBadge } from '@/utils/fileTransfers';
import { getActionMenuAnchorFromEvent } from '@/components/actionMenuPosition';
import { getAccessibleActionProps } from '@/components/accessibilityProps';
import { buildMachinesViewModel, MachinesViewState } from '@/components/machinesViewModel';
import { getMachineCliUpdateView } from '@/utils/cliUpdate';

const stylesheet = StyleSheet.create((theme) => ({
    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    groupActions: {
        flexDirection: 'row',
        gap: 4,
    },
    machineRightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    cliUpdateBadge: {
        minHeight: 28,
        paddingHorizontal: 9,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: StyleSheet.hairlineWidth,
    },
    cliUpdateBadgeText: {
        fontSize: 11,
        ...Typography.default('semiBold'),
    },
    groupActionButton: {
        width: 28,
        height: 28,
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 64,
    },
    emptyIcon: {
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 4,
        ...Typography.default('semiBold'),
    },
    emptySubtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
    },
    stateAction: {
        minHeight: 44,
        marginTop: 18,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.button.secondary.tint,
        backgroundColor: theme.colors.surfaceRaised,
    },
    stateActionText: {
        color: theme.colors.button.secondary.tint,
        fontSize: 14,
        ...Typography.default('semiBold'),
    },
    connectionNotice: {
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        padding: 14,
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: theme.colors.surfaceRaised,
    },
    connectionNoticeStatus: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    connectionNoticeCopy: {
        flex: 1,
        minWidth: 0,
    },
    connectionNoticeTitle: {
        color: theme.colors.text,
        fontSize: 14,
        lineHeight: 19,
        ...Typography.default('semiBold'),
    },
    connectionNoticeDescription: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 2,
        ...Typography.default(),
    },
    connectionNoticeAction: {
        minWidth: 44,
        minHeight: 44,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.button.secondary.tint,
        backgroundColor: theme.colors.surface,
    },
    connectionNoticeActionText: {
        color: theme.colors.button.secondary.tint,
        fontSize: 13,
        ...Typography.default('semiBold'),
    },
    pageContainer: {
        flex: 1,
    },
    screenReaderHeading: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
    },
}));

function getOperationalCopy(state: Exclude<MachinesViewState, 'ready'>) {
    switch (state) {
        case 'loading':
            return {
                title: t('homeOverview.loading'),
                description: null,
                icon: null,
            };
        case 'connecting':
            return {
                title: t('homeOverview.restoringConnection'),
                description: t('homeOverview.restoringConnectionDescription'),
                icon: 'sync-outline' as const,
            };
        case 'offline':
            return {
                title: t('homeOverview.connectionInterrupted'),
                description: t('homeOverview.connectionInterruptedDescription'),
                icon: 'cloud-offline-outline' as const,
            };
        case 'empty':
            return {
                title: t('machines.noDevices'),
                description: t('machines.noDevicesSubtitle'),
                icon: 'desktop-outline' as const,
            };
    }
}

export const MachinesView = React.memo(function MachinesView() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const styles = stylesheet;
    const { scale: listScale, s } = useDeviceScale();
    const { width: viewportWidth } = useWindowDimensions();
    const compactNotice = viewportWidth < 480;

    const allMachinesWithOffline = useAllMachines({ includeOffline: true });
    const isDataReady = useIsDataReady();
    const socketStatus = useSocketStatus();
    const [machineGroups, setMachineGroups] = useSettingMutable('machineGroups');
    const [machineGroupOrder, setMachineGroupOrder] = useSettingMutable('machineGroupOrder');
    const [groupActions, setGroupActions] = React.useState<{ anchor: ActionMenuAnchor; groupName: string } | null>(null);
    const [machineActions, setMachineActions] = React.useState<{ anchor: ActionMenuAnchor; machineId: string } | null>(null);
    const [groupPicker, setGroupPicker] = React.useState<{ anchor: ActionMenuAnchor; machineId: string } | null>(null);
    const transferTasks = useFileTransferStore(state => state.tasks);

    const visibleMachines = React.useMemo(
        () => getVisibleDeviceMachines(allMachinesWithOffline),
        [allMachinesWithOffline],
    );
    const pageModel = React.useMemo(() => buildMachinesViewModel({
        dataReady: isDataReady,
        socketStatus: socketStatus.status,
        visibleMachineCount: visibleMachines.length,
    }), [isDataReady, socketStatus.status, visibleMachines.length]);

    const groups = React.useMemo(
        () => buildMachineGroups(visibleMachines.map(m => m.id), machineGroups, machineGroupOrder),
        [visibleMachines, machineGroups, machineGroupOrder]
    );

    const transferSummary = React.useMemo(
        () => buildTransferSummary(transferTasks),
        [transferTasks],
    );

    const groupNames = React.useMemo(
        () => getOrderedMachineGroupNames(machineGroups, machineGroupOrder),
        [machineGroups, machineGroupOrder]
    );

    const handleRenameGroup = React.useCallback(async (oldName: string) => {
        const newName = await Modal.prompt(
            t('machines.renameGroup'),
            t('machines.enterGroupName'),
            { placeholder: oldName, confirmText: t('common.save'), defaultValue: oldName }
        );
        const trimmed = newName?.trim();
        if (!trimmed || trimmed === oldName) return;
        if (groupNames.includes(trimmed)) {
            Modal.alert(t('common.error'), t('machines.groupAlreadyExists'));
            return;
        }

        const updated = { ...machineGroups };
        for (const key of Object.keys(updated)) {
            if (updated[key] === oldName) {
                updated[key] = trimmed;
            }
        }
        setMachineGroups(updated);
        setMachineGroupOrder(groupNames.map(name => name === oldName ? trimmed : name));
    }, [groupNames, machineGroups, setMachineGroupOrder, setMachineGroups]);

    const handleDeleteGroup = React.useCallback(async (groupName: string) => {
        const confirmed = await Modal.confirm(
            t('machines.deleteGroup'),
            t('machines.deleteGroupConfirm', { name: groupName }),
            { confirmText: t('common.delete'), destructive: true }
        );
        if (confirmed) {
            const updated = { ...machineGroups };
            for (const key of Object.keys(updated)) {
                if (updated[key] === groupName) {
                    delete updated[key];
                }
            }
            setMachineGroups(updated);
            setMachineGroupOrder(groupNames.filter(name => name !== groupName));
        }
    }, [groupNames, machineGroups, setMachineGroupOrder, setMachineGroups]);

    const assignMachineToGroup = React.useCallback((machineId: string, groupName: string) => {
        const updated = { ...machineGroups };
        const trimmed = groupName.trim();

        if (!trimmed || trimmed === UNGROUPED_MACHINE_GROUP_KEY) {
            delete updated[machineId];
        } else {
            updated[machineId] = trimmed;
        }
        setMachineGroups(updated);
        setMachineGroupOrder(appendMachineGroupOrderIfMissing(groupNames, trimmed));
    }, [groupNames, machineGroups, setMachineGroupOrder, setMachineGroups]);

    const handleCreateGroupForMachine = React.useCallback(async (machineId: string) => {
        const name = await Modal.prompt(
            t('machines.newGroup'),
            t('machines.enterGroupName'),
            { placeholder: t('machines.groupName'), confirmText: t('common.create') }
        );
        const trimmed = name?.trim();
        if (!trimmed) return;
        if (groupNames.includes(trimmed)) {
            Modal.alert(t('common.error'), t('machines.groupAlreadyExists'));
            return;
        }

        assignMachineToGroup(machineId, trimmed);
    }, [assignMachineToGroup, groupNames]);

    const handleMoveGroup = React.useCallback((groupName: string, direction: 'up' | 'down' | 'top') => {
        const currentOrder = groupNames;
        const currentIndex = currentOrder.indexOf(groupName);
        if (currentIndex === -1) return;

        const targetIndex = direction === 'top'
            ? 0
            : direction === 'up'
                ? currentIndex - 1
                : currentIndex + 1;
        setMachineGroupOrder(moveMachineGroupOrderItem(currentOrder, groupName, targetIndex));
    }, [groupNames, setMachineGroupOrder]);

    const openGroupActions = React.useCallback((event: any, groupName: string) => {
        event.stopPropagation?.();
        setGroupActions({
            anchor: getActionMenuAnchorFromEvent(event),
            groupName,
        });
    }, []);

    const openMachineActions = React.useCallback((event: any, machineId: string) => {
        event.stopPropagation?.();
        setMachineActions({
            anchor: getActionMenuAnchorFromEvent(event),
            machineId,
        });
    }, []);

    const groupActionItems = React.useMemo<ActionMenuItem[]>(() => {
        if (!groupActions) {
            return [];
        }

        const { groupName } = groupActions;
        const currentIndex = groupNames.indexOf(groupName);
        const items: ActionMenuItem[] = [];

        if (currentIndex > 0) {
            items.push({ id: 'pin-to-top', icon: 'arrow-up-circle-outline', label: t('machines.pinToTop'), onPress: () => handleMoveGroup(groupName, 'top') });
            items.push({ id: 'move-up', icon: 'arrow-up-outline', label: t('machines.moveUp'), onPress: () => handleMoveGroup(groupName, 'up') });
        }
        if (currentIndex >= 0 && currentIndex < groupNames.length - 1) {
            items.push({ id: 'move-down', icon: 'arrow-down-outline', label: t('machines.moveDown'), onPress: () => handleMoveGroup(groupName, 'down') });
        }
        items.push({ id: 'rename', icon: 'create-outline', label: t('machines.renameGroup'), onPress: () => handleRenameGroup(groupName) });
        items.push({ id: 'delete', icon: 'trash-outline', label: t('machines.deleteGroup'), destructive: true, onPress: () => handleDeleteGroup(groupName) });

        return items;
    }, [groupActions, groupNames, handleDeleteGroup, handleMoveGroup, handleRenameGroup]);

    const machineActionItems = React.useMemo<ActionMenuItem[]>(() => {
        if (!machineActions) {
            return [];
        }

        return [
            {
                id: 'details',
                icon: 'information-circle-outline',
                label: t('machines.openDetails'),
                onPress: () => router.push(`/machine/${machineActions.machineId}`),
            },
            {
                id: 'move-to-group',
                icon: 'folder-outline',
                label: t('machines.moveToGroup'),
                onPress: () => {
                    setGroupPicker({
                        anchor: machineActions.anchor,
                        machineId: machineActions.machineId,
                    });
                },
            },
        ];
    }, [machineActions, router]);

    const groupPickerItems = React.useMemo<ActionMenuItem[]>(() => {
        if (!groupPicker) {
            return [];
        }

        return buildMachineGroupPickerOptions(
            machineGroups,
            machineGroupOrder,
            groupPicker.machineId,
            {
                ungrouped: t('machines.ungrouped'),
                newGroup: t('machines.newGroup'),
            },
        ).map((option) => {
            if (option.key === NEW_MACHINE_GROUP_KEY) {
                return {
                    id: option.key,
                    icon: 'add-outline',
                    label: option.label,
                    onPress: () => handleCreateGroupForMachine(groupPicker.machineId),
                };
            }

            return {
                id: option.key,
                icon: option.key === UNGROUPED_MACHINE_GROUP_KEY ? 'albums-outline' : 'folder-outline',
                label: option.label,
                onPress: () => assignMachineToGroup(groupPicker.machineId, option.key),
                selected: option.selected,
            };
        });
    }, [assignMachineToGroup, groupPicker, handleCreateGroupForMachine, machineGroupOrder, machineGroups]);

    const renderMachine = React.useCallback((machine: typeof allMachinesWithOffline[0]) => {
        const isOnline = pageModel.state !== 'offline' && isMachineOnline(machine);
        const host = machine.metadata?.host || t('status.unknown');
        const displayName = machine.metadata?.displayName;
        const platform = machine.metadata?.platform || '';
        const title = displayName || host;
        const transferBadge = getMachineTransferBadge(transferSummary.byMachine[machine.id]);
        const cliUpdate = getMachineCliUpdateView(machine);

        let subtitle = '';
        if (displayName && displayName !== host) {
            subtitle = host;
        }
        if (platform) {
            subtitle = subtitle ? `${subtitle} • ${platform}` : platform;
        }
        subtitle = subtitle ? `${subtitle} • ${isOnline ? t('status.online') : t('status.offline')}` : (isOnline ? t('status.online') : t('status.offline'));

        return (
            <Item
                key={machine.id}
                title={title}
                subtitle={subtitle}
                icon={
                    <Ionicons
                        name="desktop-outline"
                        size={29}
                        color={isOnline ? theme.colors.status.connected : theme.colors.status.disconnected}
                    />
                }
                onPress={() => router.push(`/machine/${machine.id}`)}
                rightElementInteractive
                rightElement={
                    <View style={[styles.machineRightActions, { gap: s(6) }]}>
                        {cliUpdate.needsUpdate ? (
                            <View
                                role="status"
                                accessible
                                accessibilityLabel={`${t('updateBanner.updateAvailable')}: ${cliUpdate.latestVersion ?? ''}`}
                                style={[
                                    styles.cliUpdateBadge,
                                    { borderColor: theme.colors.warning, backgroundColor: `${theme.colors.warning}18` },
                                ]}
                            >
                                <Ionicons name="cloud-download-outline" size={s(13)} color={theme.colors.warning} />
                                {viewportWidth >= 420 ? (
                                    <Text style={[styles.cliUpdateBadgeText, { color: theme.colors.warning }]}>
                                        {t('updateBanner.updateAvailable')}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}
                        <FileTransferBadge
                            badge={transferBadge}
                            onPress={() => router.push(`/transfers?machineId=${encodeURIComponent(machine.id)}` as any)}
                        />
                        <Pressable
                            {...getAccessibleActionProps(t('machines.deviceActions'), {
                                expanded: machineActions?.machineId === machine.id,
                            })}
                            onPress={(event) => {
                                openMachineActions(event, machine.id);
                            }}
                            hitSlop={10}
                            style={[
                                styles.groupActionButton,
                                { width: s(32), height: s(32), borderRadius: s(8) }
                            ]}
                        >
                            <Ionicons name="ellipsis-horizontal" size={s(18)} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                }
            />
        );
    }, [openMachineActions, pageModel.state, router, s, styles.cliUpdateBadge, styles.cliUpdateBadgeText, styles.groupActionButton, styles.machineRightActions, theme, transferSummary.byMachine, viewportWidth]);

    if (!pageModel.showMachineList) {
        const copy = getOperationalCopy(pageModel.state as Exclude<MachinesViewState, 'ready'>);
        const isLoading = pageModel.state === 'loading';
        const canOpenConnectionSettings = pageModel.state === 'offline';
        return (
            <View role="main" style={styles.pageContainer}>
                <View style={[styles.emptyContainer, { paddingHorizontal: s(32), paddingVertical: s(64) }]}>
                    <View
                        role="status"
                        accessible
                        accessibilityLabel={[copy.title, copy.description].filter(Boolean).join('. ')}
                        accessibilityLiveRegion="polite"
                        style={{ alignItems: 'center' }}
                    >
                        {isLoading ? (
                            <ActivityIndicator color={theme.colors.textSecondary} style={[styles.emptyIcon, { marginBottom: s(12) }]} />
                        ) : copy.icon ? (
                            <Ionicons name={copy.icon} size={s(48)} color={theme.colors.textSecondary} style={[styles.emptyIcon, { marginBottom: s(12) }]} />
                        ) : null}
                        <Text role="heading" aria-level={1} style={[styles.emptyTitle, { fontSize: s(17), marginBottom: s(4) }]}>{copy.title}</Text>
                        {copy.description ? (
                            <Text style={[styles.emptySubtitle, { fontSize: s(14), lineHeight: s(20) }]}>{copy.description}</Text>
                        ) : null}
                    </View>
                    {canOpenConnectionSettings ? (
                        <Pressable
                            {...getAccessibleActionProps(t('homeOverview.connectionSettings'))}
                            onPress={() => router.push('/server')}
                            style={styles.stateAction}
                        >
                            <Text style={styles.stateActionText}>{t('homeOverview.connectionSettings')}</Text>
                        </Pressable>
                    ) : null}
                </View>
            </View>
        );
    }

    const connectionCopy = pageModel.state === 'connecting' || pageModel.state === 'offline'
        ? getOperationalCopy(pageModel.state)
        : null;
    const connectionColor = pageModel.state === 'connecting'
        ? theme.colors.status.connecting
        : theme.colors.status.disconnected;

    return (
        <View role="main" style={styles.pageContainer}>
            <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>{t('tabs.machines')}</Text>
            <ItemList style={{ paddingTop: 0 }} itemScale={listScale}>
            {connectionCopy ? (
                <View
                    style={[
                        styles.connectionNotice,
                        { borderColor: connectionColor },
                        compactNotice && { flexDirection: 'column', alignItems: 'stretch' },
                    ]}
                >
                    <View style={styles.connectionNoticeStatus}>
                        {pageModel.state === 'connecting' ? (
                            <ActivityIndicator color={connectionColor} />
                        ) : connectionCopy.icon ? (
                            <Ionicons name={connectionCopy.icon} size={22} color={connectionColor} />
                        ) : null}
                        <View
                            role="status"
                            accessible
                            accessibilityLabel={[connectionCopy.title, connectionCopy.description].filter(Boolean).join('. ')}
                            accessibilityLiveRegion="polite"
                            style={styles.connectionNoticeCopy}
                        >
                            <Text style={styles.connectionNoticeTitle}>{connectionCopy.title}</Text>
                            {connectionCopy.description ? (
                                <Text style={styles.connectionNoticeDescription}>{connectionCopy.description}</Text>
                            ) : null}
                        </View>
                    </View>
                    {pageModel.state === 'offline' ? (
                        <Pressable
                            {...getAccessibleActionProps(t('homeOverview.connectionSettings'))}
                            onPress={() => router.push('/server')}
                            style={[
                                styles.connectionNoticeAction,
                                compactNotice && { alignSelf: 'stretch' },
                            ]}
                        >
                            <Text style={styles.connectionNoticeActionText}>{t('homeOverview.connectionSettings')}</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}
            {groups.map((group) => {
                const isUngrouped = group.name === UNGROUPED_MACHINE_GROUP_KEY;
                const groupTitle = isUngrouped ? t('machines.ungrouped') : group.name;
                const machinesInGroup = visibleMachines.filter(m => group.machineIds.includes(m.id));

                return (
                    <ItemGroup
                        key={group.name}
                        title={
                            <View style={styles.groupHeader}>
                                <Text style={{ fontSize: s(13), lineHeight: s(18), fontWeight: '600', color: theme.colors.textSecondary, ...Typography.default('semiBold') }}>
                                    {groupTitle}
                                    <Text style={{ fontWeight: '400', color: theme.colors.textSecondary }}> ({machinesInGroup.length})</Text>
                                </Text>
                                {!isUngrouped && (
                                    <View style={[styles.groupActions, { gap: s(4) }]}>
                                        <Pressable
                                            {...getAccessibleActionProps(t('machines.groupActions'), {
                                                expanded: groupActions?.groupName === group.name,
                                            })}
                                            style={[
                                                styles.groupActionButton,
                                                { width: s(32), height: s(32), borderRadius: s(8) }
                                            ]}
                                            onPress={(event) => openGroupActions(event, group.name)}
                                            hitSlop={8}
                                        >
                                            <Ionicons name="ellipsis-horizontal" size={s(18)} color={theme.colors.textSecondary} />
                                        </Pressable>
                                    </View>
                                )}
                            </View>
                        }
                        headerStyle={{ paddingHorizontal: Platform.select({ ios: s(32), default: s(28) }) }}
                    >
                        {machinesInGroup.length === 0 ? (
                            <Item
                                title={t('machines.emptyGroup')}
                                subtitle={t('machines.emptyGroupSubtitle')}
                                showChevron={false}
                            />
                        ) : machinesInGroup.map(machine => renderMachine(machine))}
                    </ItemGroup>
                );
            })}

            <ActionMenu
                anchor={groupActions?.anchor ?? null}
                items={groupActionItems}
                onClose={() => setGroupActions(null)}
                title={groupActions?.groupName}
                visible={!!groupActions}
            />
            <ActionMenu
                anchor={machineActions?.anchor ?? null}
                items={machineActionItems}
                onClose={() => setMachineActions(null)}
                title={t('machines.deviceActions')}
                visible={!!machineActions}
            />
            <ActionMenu
                anchor={groupPicker?.anchor ?? null}
                items={groupPickerItems}
                onClose={() => setGroupPicker(null)}
                title={t('machines.moveToGroup')}
                visible={!!groupPicker}
            />
            </ItemList>
        </View>
    );
});
