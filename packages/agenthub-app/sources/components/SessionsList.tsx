import React from 'react';
import { View, FlatList } from 'react-native';
import { ProjectListViewItem, useProjectListViewData } from '@/sync/storage';
import { ProjectGroupView, MachineSeparator } from './ActiveSessionsGroupCompact';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';
import { UpdateBanner } from './UpdateBanner';
import { layout } from './layout';
import { requestReview } from '@/utils/requestReview';
import { gitStatusSync } from '@/sync/gitStatusSync';
import { useAllMachines, storage } from '@/sync/storage';
import { filterCollapsedMachineProjects } from '@/utils/sessionListMachineCollapse';
import { buildActiveCodexMirrorSyncKey } from '@/sync/officialArchiveSync';
import {
    buildOfficialDiscoveryScopesForProjectList,
    collectProjectSessionIds,
    refreshOfficialThreadsForProjectList,
} from '@/sync/sessionListRefresh';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'stretch',
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        flex: 1,
        maxWidth: layout.maxWidth,
    },
}));

export function SessionsList() {
    const styles = stylesheet;
    const safeArea = useSafeAreaInsets();
    const data = useProjectListViewData();
    const dataRef = React.useRef(data);
    const machines = useAllMachines({ includeOffline: true });
    const activeCodexMirrorSyncKey = storage((state) => buildActiveCodexMirrorSyncKey(state.sessions));
    const [collapsedMachineIds, setCollapsedMachineIds] = React.useState<Set<string>>(() => new Set());
    React.useEffect(() => {
        dataRef.current = data;
    }, [data]);

    const officialDiscoveryScopes = React.useMemo(() => {
        return buildOfficialDiscoveryScopesForProjectList(data, machines);
    }, [data, machines]);
    const officialDiscoveryScopeKey = React.useMemo(() => officialDiscoveryScopes
        .map((scope) => `${scope.machineId}:${scope.paths.join(',')}`)
        .join('|'), [officialDiscoveryScopes]);
    const projectSyncSessionIds = React.useMemo(() => collectProjectSessionIds(data), [data]);
    const projectSyncSessionKey = projectSyncSessionIds.join('|');
    const visibleData = React.useMemo(() => {
        if (!data) {
            return null;
        }
        return filterCollapsedMachineProjects(data, collapsedMachineIds);
    }, [collapsedMachineIds, data]);
    const toggleMachineCollapsed = React.useCallback((machineId: string) => {
        setCollapsedMachineIds((current) => {
            const next = new Set(current);
            if (next.has(machineId)) {
                next.delete(machineId);
            } else {
                next.add(machineId);
            }
            return next;
        });
    }, []);

    // Request review
    React.useEffect(() => {
        if (data && data.length > 0) {
            requestReview();
        }
    }, [data && data.length > 0]);

    React.useEffect(() => {
        if (!projectSyncSessionKey) {
            return;
        }

        projectSyncSessionKey.split('|').forEach((sessionId) => {
            gitStatusSync.getSync(sessionId).invalidate();
        });
    }, [projectSyncSessionKey]);

    React.useEffect(() => {
        let cancelled = false;
        void refreshOfficialThreadsForProjectList({
            projectItems: dataRef.current,
            machines,
            sessions: storage.getState().sessions,
            applyOfficialThreads: (machineId, threads) => {
                if (!cancelled) {
                    storage.getState().applyOfficialCodexThreads(machineId, threads);
                }
            },
        });

        return () => {
            cancelled = true;
        };
    }, [activeCodexMirrorSyncKey, machines, officialDiscoveryScopeKey]);

    // Early return if no data yet
    if (!data) {
        return (
            <View style={styles.container} />
        );
    }

    const HeaderComponent = React.useCallback(() => {
        return (
            <UpdateBanner />
        );
    }, []);

    const renderItem = React.useCallback(({ item }: { item: ProjectListViewItem }) => {
        if (item.type === 'machine-separator') {
            return (
                <MachineSeparator
                    machineName={item.machineName}
                    machineId={item.machineId}
                    collapsed={collapsedMachineIds.has(item.machineId)}
                    onToggleCollapsed={toggleMachineCollapsed}
                />
            );
        }
        return (
            <ProjectGroupView
                project={item.project}
            />
        );
    }, [collapsedMachineIds, toggleMachineCollapsed]);

    const keyExtractor = React.useCallback((item: ProjectListViewItem) => {
        if (item.type === 'machine-separator') return `sep-${item.machineId}`;
        return `project-${item.project.key}`;
    }, []);

    return (
        <View style={styles.container}>
            <View style={styles.contentContainer}>
                <FlatList
                    data={visibleData}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={{ paddingBottom: safeArea.bottom + 128, maxWidth: layout.maxWidth }}
                    ListHeaderComponent={HeaderComponent}
                    windowSize={5}
                    maxToRenderPerBatch={8}
                    initialNumToRender={12}
                />
            </View>
        </View>
    );
}
