import * as React from 'react';
import { View, ActivityIndicator, Text, Pressable, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSocketStatus, useSettingMutable } from '@/sync/storage';
import { useVisibleSessionListViewData } from '@/hooks/useVisibleSessionListViewData';
import { useIsTablet } from '@/utils/responsive';
import { useRouter } from 'expo-router';
import { EmptySessionsTablet } from './EmptySessionsTablet';
import { SessionsList } from './SessionsList';
import { FABWide } from './FABWide';
import { TabBar, TabType } from './TabBar';
import { SettingsViewWrapper } from './SettingsViewWrapper';
import { SessionsListWrapper } from './SessionsListWrapper';
import { MachinesView } from './MachinesView';
import { Header } from './navigation/Header';
import { HeaderLogo } from './HeaderLogo';
import { StatusDot } from './StatusDot';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { isUsingCustomServer } from '@/sync/serverConfig';
import { ActionMenu, ActionMenuAnchor, ActionMenuItem } from '@/components/ActionMenu';
import { getActionMenuAnchorFromEvent } from '@/components/actionMenuPosition';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { Modal } from '@/modal';
import { getMachineHeaderActionDescriptors } from '@/utils/machineActions';
import { getOrderedMachineGroupNames } from '@/utils/machineGroups';
import { TransferHeaderIcon } from '@/components/FileTransferBadge';
import { useFileTransferStore } from '@/sync/fileTransferStore';
import { buildTransferSummary } from '@/utils/fileTransfers';
import { useUpdates } from '@/hooks/useUpdates';
import { useRefreshProjectSessionList } from '@/hooks/useRefreshProjectSessionList';
import { getAccessibleActionProps } from './accessibilityProps';
import { HomeOverview } from './HomeOverview';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { sync } from '@/sync/sync';

interface MainViewProps {
    variant: 'phone' | 'sidebar';
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    phoneContainer: {
        flex: 1,
    },
    sidebarContentContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
    },
    loadingContainerWrapper: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 32,
    },
    tabletLoadingContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        ...Typography.default(),
    },
    emptyStateContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
        flexDirection: 'column',
        backgroundColor: theme.colors.groupped.background,
    },
    emptyStateContentContainer: {
        flex: 1,
        flexBasis: 0,
        flexGrow: 1,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    titleText: {
        fontSize: 17,
        color: theme.colors.header.tint,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: -2,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
        ...Typography.default(),
    },
    headerButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
}));

// Tab header configuration
const TAB_TITLES = {
    machines: 'tabs.machines',
    sessions: 'tabs.sessions',
    settings: 'tabs.settings',
} as const;

// Active tabs
type ActiveTabType = 'machines' | 'sessions' | 'settings';

// Header title component with connection status
const HeaderTitle = React.memo(({ activeTab }: { activeTab: ActiveTabType }) => {
    const { theme } = useUnistyles();
    const socketStatus = useSocketStatus();

    const connectionStatus = React.useMemo(() => {
        const { status } = socketStatus;
        switch (status) {
            case 'connected':
                return {
                    color: theme.colors.status.connected,
                    isPulsing: false,
                    text: t('status.connected'),
                };
            case 'connecting':
                return {
                    color: theme.colors.status.connecting,
                    isPulsing: true,
                    text: t('status.connecting'),
                };
            case 'disconnected':
                return {
                    color: theme.colors.status.disconnected,
                    isPulsing: false,
                    text: t('status.disconnected'),
                };
            case 'error':
                return {
                    color: theme.colors.status.error,
                    isPulsing: false,
                    text: t('status.error'),
                };
            default:
                return {
                    color: theme.colors.status.default,
                    isPulsing: false,
                    text: '',
                };
        }
    }, [socketStatus, theme]);

    return (
        <View style={styles.titleContainer}>
            <Text style={styles.titleText}>
                {t(TAB_TITLES[activeTab])}
            </Text>
            {connectionStatus.text && (
                <View
                    role="status"
                    accessible
                    accessibilityLabel={connectionStatus.text}
                    accessibilityLiveRegion="polite"
                    style={styles.statusContainer}
                >
                    <StatusDot
                        color={connectionStatus.color}
                        isPulsing={connectionStatus.isPulsing}
                        size={6}
                        style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.statusText, { color: theme.colors.textSecondary }]}>
                        {connectionStatus.text}
                    </Text>
                </View>
            )}
        </View>
    );
});

const MachinesHeaderActions = React.memo(() => {
    const { theme } = useUnistyles();
    const router = useRouter();
    const { connectTerminal, connectWithUrl, isLoading: isConnectingTerminal } = useConnectTerminal();
    const [machineGroups] = useSettingMutable('machineGroups');
    const [machineGroupOrder, setMachineGroupOrder] = useSettingMutable('machineGroupOrder');
    const [machineActionsAnchor, setMachineActionsAnchor] = React.useState<ActionMenuAnchor | null>(null);
    const transferTasks = useFileTransferStore(state => state.tasks);

    const groupNames = React.useMemo(
        () => getOrderedMachineGroupNames(machineGroups, machineGroupOrder),
        [machineGroups, machineGroupOrder],
    );

    const transferSummary = React.useMemo(
        () => buildTransferSummary(transferTasks),
        [transferTasks],
    );

    const handleCreateGroup = React.useCallback(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        const name = await runSessionActionRequest({
            isCurrent,
            request: () => Modal.prompt(
                t('machines.newGroup'),
                t('machines.enterGroupName'),
                { placeholder: t('machines.groupName'), confirmText: t('common.create') },
            ),
        });
        const trimmed = name?.trim();
        if (!trimmed || !isCurrent()) return;
        if (groupNames.includes(trimmed)) {
            Modal.alert(t('common.error'), t('machines.groupAlreadyExists'));
            return;
        }

        setMachineGroupOrder([...groupNames, trimmed]);
    }, [groupNames, setMachineGroupOrder]);

    const handleManualUrl = React.useCallback(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        const url = await runSessionActionRequest({
            isCurrent,
            request: () => Modal.prompt(
                t('modals.authenticateTerminal'),
                t('modals.pasteUrlFromTerminal'),
                {
                    placeholder: 'agenthub://terminal?...',
                    confirmText: t('common.continue'),
                },
            ),
        });
        if (url?.trim() && isCurrent()) {
            connectWithUrl(url.trim());
        }
    }, [connectWithUrl]);

    const machineActionItems = React.useMemo<ActionMenuItem[]>(() => {
        const descriptors = getMachineHeaderActionDescriptors({ canScanQr: Platform.OS !== 'web' });
        return descriptors.map((descriptor) => {
            switch (descriptor.id) {
                case 'scan-qr-code':
                    return {
                        id: descriptor.id,
                        icon: descriptor.icon,
                        label: t(descriptor.labelKey),
                        onPress: connectTerminal,
                        disabled: isConnectingTerminal,
                    };
                case 'enter-auth-link':
                    return {
                        id: descriptor.id,
                        icon: descriptor.icon,
                        label: t(descriptor.labelKey),
                        onPress: handleManualUrl,
                        disabled: isConnectingTerminal,
                    };
                case 'new-group':
                    return {
                        id: descriptor.id,
                        icon: descriptor.icon,
                        label: t(descriptor.labelKey),
                        onPress: handleCreateGroup,
                    };
            }
        });
    }, [connectTerminal, handleCreateGroup, handleManualUrl, isConnectingTerminal]);

    return (
        <>
            <View style={styles.headerActions}>
                <TransferHeaderIcon
                    failedCount={transferSummary.global.failedCount}
                    activeCount={transferSummary.global.activeCount}
                    accessibilityLabel={t('common.fileTransfers')}
                    onPress={() => router.push('/transfers' as any)}
                />
                <Pressable
                    {...getAccessibleActionProps(t('machines.deviceActions'), {
                        expanded: !!machineActionsAnchor,
                    })}
                    onPress={(event) => setMachineActionsAnchor(getActionMenuAnchorFromEvent(event))}
                    hitSlop={15}
                    style={styles.headerButton}
                >
                    <Ionicons name="add-outline" size={28} color={theme.colors.header.tint} />
                </Pressable>
            </View>
            <ActionMenu
                anchor={machineActionsAnchor}
                items={machineActionItems}
                onClose={() => setMachineActionsAnchor(null)}
                title={t('tabs.machines')}
                visible={!!machineActionsAnchor}
            />
        </>
    );
});

const SessionsHeaderActions = React.memo(() => {
    const router = useRouter();
    const { theme } = useUnistyles();
    const { isRefreshing, refreshProjectSessions } = useRefreshProjectSessionList();

    return (
        <View style={styles.headerActions}>
            <Pressable
                {...getAccessibleActionProps(t('project.syncStatus'), {
                    busy: isRefreshing,
                    disabled: isRefreshing,
                })}
                disabled={isRefreshing}
                onPress={() => {
                    void refreshProjectSessions();
                }}
                hitSlop={15}
                style={styles.headerButton}
            >
                {isRefreshing ? (
                    <ActivityIndicator size="small" color={theme.colors.header.tint} />
                ) : (
                    <Ionicons name="sync-outline" size={23} color={theme.colors.header.tint} />
                )}
            </Pressable>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('project.newSession')}
                onPress={() => router.navigate('/new')}
                hitSlop={15}
                style={styles.headerButton}
            >
                <Ionicons name="add-outline" size={28} color={theme.colors.header.tint} />
            </Pressable>
        </View>
    );
});

// Header right button - varies by tab
const HeaderRight = React.memo(({ activeTab }: { activeTab: ActiveTabType }) => {
    const { theme } = useUnistyles();
    const isCustomServer = isUsingCustomServer();
    const router = useRouter();

    if (activeTab === 'sessions') {
        return <SessionsHeaderActions />;
    }

    if (activeTab === 'machines') {
        return <MachinesHeaderActions />;
    }

    if (activeTab === 'settings') {
        if (!isCustomServer) {
            // Empty view to maintain header centering
            return <View style={styles.headerButton} />;
        }
        return (
            <Pressable
                {...getAccessibleActionProps(t('server.serverConfiguration'))}
                onPress={() => router.push('/server')}
                hitSlop={15}
                style={styles.headerButton}
            >
                <Ionicons name="server-outline" size={24} color={theme.colors.header.tint} />
            </Pressable>
        );
    }

    return null;
});

export const MainView = React.memo(({ variant }: MainViewProps) => {
    const { theme } = useUnistyles();
    useUpdates();
    const sessionListViewData = useVisibleSessionListViewData();
    const isTablet = useIsTablet();
    const router = useRouter();
    // Tab state management
    // NOTE: Zen tab removed - the feature never got to a useful state
    const [activeTab, setActiveTab] = React.useState<TabType>('sessions');

    const handleNewSession = React.useCallback(() => {
        router.navigate('/new');
    }, [router]);

    const handleTabPress = React.useCallback((tab: TabType) => {
        setActiveTab(tab);
    }, []);

    // Regular phone mode with tabs - define this before any conditional returns
    const renderTabContent = React.useCallback(() => {
        switch (activeTab) {
            case 'machines':
                return <MachinesView />;
            case 'settings':
                return <SettingsViewWrapper />;
            case 'sessions':
            default:
                return <SessionsListWrapper />;
        }
    }, [activeTab]);

    // Sidebar variant
    if (variant === 'sidebar') {
        // Loading state
        if (sessionListViewData === null) {
            return (
                <View style={styles.sidebarContentContainer}>
                    <View style={styles.tabletLoadingContainer}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        <Text
                            role="status"
                            accessibilityLiveRegion="polite"
                            style={styles.loadingText}
                        >
                            {t('homeOverview.loading')}
                        </Text>
                    </View>
                </View>
            );
        }

        // Empty state
        if (sessionListViewData.length === 0) {
            return (
                <View style={styles.sidebarContentContainer}>
                    <View style={styles.emptyStateContainer}>
                        <EmptySessionsTablet />
                    </View>
                </View>
            );
        }

        // Sessions list
        return (
            <View style={styles.sidebarContentContainer}>
                <SessionsList />
            </View>
        );
    }

    // Phone variant
    // Tablet in phone mode - special case (when showing index view on tablets, show empty view)
    if (isTablet) {
        return <HomeOverview />;
    }

    // Regular phone mode with tabs
    return (
        <>
            <View style={styles.phoneContainer}>
                <View style={{ backgroundColor: theme.colors.header.background }}>
                    <Header
                        title={<HeaderTitle activeTab={activeTab as ActiveTabType} />}
                        headerRight={() => <HeaderRight activeTab={activeTab as ActiveTabType} />}
                        headerLeft={() => <HeaderLogo />}
                        headerShadowVisible={false}
                        headerTransparent={true}
                    />
                </View>
                {renderTabContent()}
            </View>
            <TabBar
                activeTab={activeTab}
                onTabPress={handleTabPress}
            />
        </>
    );
});
