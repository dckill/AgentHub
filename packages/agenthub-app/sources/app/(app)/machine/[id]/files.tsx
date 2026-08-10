import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Octicons from '@expo/vector-icons/Octicons';
import * as Clipboard from 'expo-clipboard';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ActionMenu, type ActionMenuAnchor, type ActionMenuItem } from '@/components/ActionMenu';
import { getActionMenuAnchorFromEvent } from '@/components/actionMenuPosition';
import { DirectoryTreePanel } from '@/components/DirectoryTreePanel';
import { FilePreviewPanel } from '@/components/FilePreviewPanel';
import type { LocalTreeNode } from '@/hooks/useDirectoryTree';
import { useDirectoryTree } from '@/hooks/useDirectoryTree';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { Modal } from '@/modal';
import { machineDeleteFile } from '@/sync/ops';
import { useFileTransferStore } from '@/sync/fileTransferStore';
import { useIsDataReady, useMachine } from '@/sync/storage';
import { t } from '@/text';
import { isMachineOnline } from '@/utils/machineUtils';
import { ensureDownloadDirectoryBeforeStart } from '@/utils/downloadDirectoryPrompt';
import { ScreenReaderHeading } from '@/components/ScreenReaderHeading';
import { sync } from '@/sync/sync';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';

export default function MachineFilesScreen() {
    const { id: machineId } = useLocalSearchParams<{ id: string }>();
    const machine = useMachine(machineId!);
    const isDataReady = useIsDataReady();
    const router = useRouter();
    const { theme } = useUnistyles();
    const { width } = useWindowDimensions();
    const [selectedFile, setSelectedFile] = React.useState<{ path: string; name: string } | null>(null);
    const [fileActions, setFileActions] = React.useState<{ anchor: ActionMenuAnchor; node: LocalTreeNode } | null>(null);
    const source = React.useMemo(() => ({ kind: 'machine' as const, machineId: machineId! }), [machineId]);
    const tasks = useFileTransferStore(state => state.tasks);
    const enqueueDownloadPaused = useFileTransferStore(state => state.enqueueDownloadPaused);
    const startDownload = useFileTransferStore(state => state.startDownload);
    const transferSettings = useFileTransferStore(state => state.settings);
    const setDownloadDirectory = useFileTransferStore(state => state.setDownloadDirectory);
    const pauseTask = useFileTransferStore(state => state.pauseTask);
    const cancelTask = useFileTransferStore(state => state.cancelTask);
    const retryTask = useFileTransferStore(state => state.retryTask);
    const machineName = machine?.metadata?.displayName || machine?.metadata?.host || machineId || t('status.unknown');
    const isOnline = !!machine && isMachineOnline(machine);
    const isWide = Platform.OS === 'web' || width >= 768;

    const {
        tree,
        isLoading,
        error,
        expanded,
        loadingPaths,
        toggleNode,
        refresh,
    } = useDirectoryTree(source, isOnline ? '/' : null);

    const openTransfers = React.useCallback((taskId?: string) => {
        if (!machineId) return;
        const query = taskId
            ? `/transfers?machineId=${encodeURIComponent(machineId)}&taskId=${encodeURIComponent(taskId)}`
            : `/transfers?machineId=${encodeURIComponent(machineId)}`;
        router.push(query as any);
    }, [machineId, router]);

    const selectedActionTask = React.useMemo(() => {
        if (!fileActions || !machineId) return null;
        return tasks.find(task => task.machineId === machineId && task.remotePath === fileActions.node.path) ?? null;
    }, [fileActions, machineId, tasks]);

    const handleFileSelect = React.useCallback((path: string, fileName: string) => {
        setSelectedFile((current) =>
            current?.path === path ? null : { path, name: fileName },
        );
    }, []);

    const openFileActions = React.useCallback((node: LocalTreeNode, event: any) => {
        event.stopPropagation?.();
        setFileActions({
            anchor: getActionMenuAnchorFromEvent(event),
            node,
        });
    }, []);

    const fileActionItems = React.useMemo<ActionMenuItem[]>(() => {
        if (!fileActions) {
            return [];
        }

        const node = fileActions.node;
        const items: ActionMenuItem[] = [];
        const existing = selectedActionTask;

        if (existing && existing.status !== 'completed' && existing.status !== 'cancelled') {
            items.push({
                id: 'view-transfer',
                icon: 'list-outline',
                label: t('fileBrowser.viewDownloadTask'),
                onPress: () => openTransfers(existing.id),
            });
            if (existing.status === 'downloading' || existing.status === 'queued') {
                items.push({
                    id: 'pause-transfer',
                    icon: 'pause-outline',
                    label: t('fileBrowser.pauseDownload'),
                    onPress: () => pauseTask(existing.id),
                });
            } else {
                items.push({
                    id: 'resume-transfer',
                    icon: 'play-outline',
                    label: t('fileBrowser.resumeDownload'),
                    onPress: () => retryTask(existing.id),
                });
            }
            items.push({
                id: 'cancel-transfer',
                icon: 'close-circle-outline',
                label: t('fileBrowser.cancelDownload'),
                destructive: true,
                onPress: () => cancelTask(existing.id),
            });
        } else {
            items.push({
                id: 'download',
                icon: 'cloud-download-outline',
                label: t('fileBrowser.downloadToDevice'),
                disabled: !machineId || !isOnline,
                onPress: async () => {
                    if (!machineId || !isOnline) return;
                    const canDownload = await ensureDownloadDirectoryBeforeStart(transferSettings, setDownloadDirectory);
                    if (!canDownload) return;
                    const taskId = enqueueDownloadPaused({
                        machineId,
                        remotePath: node.path,
                        fileName: node.name,
                        size: node.size,
                        modified: node.modified,
                    });
                    startDownload(taskId);
                    Modal.alert(t('fileBrowser.queuedTitle'), node.name, [
                        { text: t('fileBrowser.view'), onPress: () => openTransfers(taskId) },
                        { text: t('common.ok') },
                    ]);
                },
            });
        }

        items.push({
            id: 'info',
            icon: 'information-circle-outline',
            label: t('fileBrowser.fileInfoTitle'),
            onPress: () => {
                const size = typeof node.size === 'number' ? `${node.size} B` : t('fileBrowser.unknown');
                const modified = typeof node.modified === 'number' ? new Date(node.modified).toLocaleString() : t('fileBrowser.unknown');
                Modal.alert(t('fileBrowser.fileInfoTitle'), t('fileBrowser.fileInfoMessage', { name: node.name, path: node.path, size, modified }));
            },
        });
        items.push({
            id: 'copy-path',
            icon: 'copy-outline',
            label: t('fileBrowser.copyPath'),
            onPress: async () => {
                await Clipboard.setStringAsync(node.path);
                Modal.alert(t('common.copied'), node.path);
            },
        });
        items.push({
            id: 'delete',
            icon: 'trash-outline',
            label: t('fileBrowser.deleteRemoteFile'),
            destructive: true,
            disabled: !machineId || !isOnline,
            onPress: async () => {
                if (!machineId || !isOnline) return;
                const generation = sync.getAccountGeneration();
                const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
                if (!isCurrent()) return;
                const confirmed = await Modal.confirm(
                    t('fileBrowser.deleteTitle'),
                    t('fileBrowser.deleteMessage', { path: node.path }),
                    { cancelText: t('common.cancel'), confirmText: t('common.delete'), destructive: true },
                );
                if (!confirmed || !isCurrent()) return;
                const result = await runSessionActionRequest({
                    isCurrent,
                    request: () => machineDeleteFile(machineId, node.path),
                });
                if (result === null || !isCurrent()) return;
                if (!result.success) {
                    Modal.alert(t('common.error'), result.error || t('fileBrowser.deleteFailed'));
                    return;
                }
                if (selectedFile?.path === node.path) {
                    setSelectedFile(null);
                }
                refresh();
            },
        });

        return items;
    }, [
        cancelTask,
        enqueueDownloadPaused,
        fileActions,
        isOnline,
        machineId,
        openTransfers,
        pauseTask,
        refresh,
        retryTask,
        selectedActionTask,
        selectedFile?.path,
        setDownloadDirectory,
        startDownload,
        transferSettings,
    ]);

    const renderOfflineState = () => (
        <View accessibilityRole="alert" style={styles.centerState}>
            <Octicons name="device-desktop" size={30} color={theme.colors.textSecondary} />
            <Text style={styles.centerTitle}>{t('fileBrowser.deviceOffline')}</Text>
            <Text style={styles.centerText}>{t('fileBrowser.deviceOfflineMessage')}</Text>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
                onPress={() => void sync.refreshMachines()}
                style={styles.stateButton}
            >
                <Text style={styles.stateButtonText}>{t('common.retry')}</Text>
            </Pressable>
        </View>
    );

    const renderMissingState = () => (
        <View accessibilityRole={isDataReady ? 'alert' : 'progressbar'} accessibilityLiveRegion="polite" style={styles.centerState}>
            {!isDataReady ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : null}
            <Text style={isDataReady ? styles.centerTitle : styles.centerText}>
                {isDataReady ? t('machine.notFound') : t('fileBrowser.loadingDevice')}
            </Text>
            {isDataReady ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.stateButton}>
                    <Text style={styles.stateButtonText}>{t('common.back')}</Text>
                </Pressable>
            ) : null}
        </View>
    );

    const renderTree = (selectedFilePath: string | null) => (
        <DirectoryTreePanel
            tree={tree}
            isLoading={isLoading}
            error={error}
            expanded={expanded}
            loadingPaths={loadingPaths}
            onToggle={toggleNode}
            onFileSelect={handleFileSelect}
            onFileActions={openFileActions}
            selectedFilePath={selectedFilePath}
            onRetry={refresh}
        />
    );

    const renderPreview = () => {
        if (!selectedFile) {
            return (
                <View style={styles.previewEmpty}>
                    <Ionicons name="document-text-outline" size={34} color={theme.colors.textSecondary} />
                    <Text style={styles.centerText}>{t('fileBrowser.selectFile')}</Text>
                </View>
            );
        }
        return (
            <FilePreviewPanel
                source={source}
                machineId={machineId}
                filePath={selectedFile.path}
                fileName={selectedFile.name}
                onClose={() => setSelectedFile(null)}
            />
        );
    };

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: t('fileBrowser.title'),
                    headerBackTitle: machineName,
                }}
            />
            <View role="main" style={[styles.container, { backgroundColor: theme.colors.surface }]}>
                <ScreenReaderHeading title={t('fileBrowser.title')} />
                {!machine ? (
                    renderMissingState()
                ) : !isOnline ? (
                    renderOfflineState()
                ) : isWide ? (
                    <View style={styles.wideContent}>
                        <View style={styles.treePane}>
                            {renderTree(selectedFile?.path ?? null)}
                        </View>
                        <View style={styles.previewPane}>
                            {renderPreview()}
                        </View>
                    </View>
                ) : selectedFile ? (
                    renderPreview()
                ) : (
                    renderTree(null)
                )}
                <ActionMenu
                    anchor={fileActions?.anchor ?? null}
                    items={fileActionItems}
                    onClose={() => setFileActions(null)}
                    title={fileActions?.node.name}
                    visible={!!fileActions}
                />
            </View>
        </>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    wideContent: {
        flex: 1,
        flexDirection: 'row',
        minHeight: 0,
    },
    treePane: {
        width: 360,
        maxWidth: '42%',
        minWidth: 280,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: theme.colors.divider,
    },
    previewPane: {
        flex: 1,
        minWidth: 0,
    },
    previewEmpty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 24,
    },
    centerState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 28,
    },
    centerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    centerText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
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
