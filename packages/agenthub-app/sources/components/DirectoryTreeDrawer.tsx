import * as React from 'react';
import { View, Modal as RNModal, Pressable, Text, Platform, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { DirectoryTreePanel } from '@/components/DirectoryTreePanel';
import { FilePreviewPanel } from '@/components/FilePreviewPanel';
import { Typography } from '@/constants/Typography';
import { useDirectoryTree, type LocalTreeNode } from '@/hooks/useDirectoryTree';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { ActionMenu, type ActionMenuAnchor, type ActionMenuItem } from '@/components/ActionMenu';
import { Modal } from '@/modal';
import * as Clipboard from 'expo-clipboard';
import { machineDeleteFile } from '@/sync/ops';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { sync } from '@/sync/sync';
import { useFileTransferStore } from '@/sync/fileTransferStore';
import { ensureDownloadDirectoryBeforeStart } from '@/utils/downloadDirectoryPrompt';
import { useRouter } from 'expo-router';
import { getActionMenuAnchorFromEvent } from '@/components/actionMenuPosition';

interface DirectoryTreeDrawerProps {
    sessionId: string;
    machineId?: string | null;
    sessionPath?: string | null;
    visible: boolean;
    onClose: () => void;
}

const ANIMATION_DURATION = 250;
const EASING_ANIM = Easing.out(Easing.cubic);

export const DirectoryTreeDrawer = React.memo<DirectoryTreeDrawerProps>(({
    sessionId,
    machineId,
    sessionPath,
    visible,
    onClose,
}) => {
    const { theme } = useUnistyles();
    const { width: windowWidth } = useWindowDimensions();
    const router = useRouter();

    const [selectedFile, setSelectedFile] = React.useState<{ path: string; name: string } | null>(null);
    const [fileActions, setFileActions] = React.useState<{ anchor: ActionMenuAnchor; node: LocalTreeNode } | null>(null);
    const drawerWidth = Math.min(Math.max(Math.floor(windowWidth * 0.28), 220), 320);
    const tasks = useFileTransferStore(state => state.tasks);
    const enqueueDownloadPaused = useFileTransferStore(state => state.enqueueDownloadPaused);
    const startDownload = useFileTransferStore(state => state.startDownload);
    const transferSettings = useFileTransferStore(state => state.settings);
    const setDownloadDirectory = useFileTransferStore(state => state.setDownloadDirectory);
    const pauseTask = useFileTransferStore(state => state.pauseTask);
    const cancelTask = useFileTransferStore(state => state.cancelTask);
    const retryTask = useFileTransferStore(state => state.retryTask);

    const {
        tree,
        isLoading,
        error,
        expanded,
        loadingPaths,
        toggleNode,
        refresh,
    } = useDirectoryTree(sessionId, sessionPath);

    const slideAnim = useSharedValue(visible ? 1 : 0);

    React.useEffect(() => {
        slideAnim.value = withTiming(visible ? 1 : 0, {
            duration: ANIMATION_DURATION,
            easing: EASING_ANIM,
        });
    }, [visible]);

    // Clear selection when closing
    React.useEffect(() => {
        if (!visible) setSelectedFile(null);
    }, [visible]);

    const handleFileSelect = React.useCallback((path: string, fileName: string) => {
        setSelectedFile((current) =>
            current?.path === path ? null : { path, name: fileName },
        );
    }, []);

    const handleCloseFile = React.useCallback(() => {
        setSelectedFile(null);
    }, []);

    const openFileActions = React.useCallback((node: LocalTreeNode, event: any) => {
        event.stopPropagation?.();
        setFileActions({
            anchor: getActionMenuAnchorFromEvent(event),
            node,
        });
    }, []);

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

    const fileActionItems = React.useMemo<ActionMenuItem[]>(() => {
        if (!fileActions) {
            return [];
        }

        const node = fileActions.node;
        const items: ActionMenuItem[] = [];
        const hasMachine = !!machineId;
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
                disabled: !hasMachine,
                onPress: async () => {
                    if (!machineId) return;
                    const canDownload = await ensureDownloadDirectoryBeforeStart(transferSettings, setDownloadDirectory);
                    if (!canDownload) return;
                    const taskId = enqueueDownloadPaused({
                        machineId,
                        sessionId,
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
            disabled: !hasMachine,
            onPress: async () => {
                if (!machineId) return;
                const generation = sync.getAccountGeneration();
                const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
                const confirmed = await runSessionActionRequest({
                    isCurrent,
                    request: () => Modal.confirm(
                        t('fileBrowser.deleteTitle'),
                        t('fileBrowser.deleteMessage', { path: node.path }),
                        { cancelText: t('common.cancel'), confirmText: t('common.delete'), destructive: true },
                    ),
                });
                if (confirmed !== true) return;
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
        machineId,
        openTransfers,
        pauseTask,
        refresh,
        retryTask,
        selectedActionTask,
        selectedFile?.path,
        setDownloadDirectory,
        sessionId,
        startDownload,
        transferSettings,
    ]);

    const handleBack = React.useCallback(() => {
        if (selectedFile) {
            setSelectedFile(null);
        } else {
            onClose();
        }
    }, [selectedFile, onClose]);

    const isDesktop = Platform.OS === 'web' || windowWidth >= 768;

    // Mobile: full-screen modal
    if (!isDesktop) {
        return (
            <RNModal
                visible={visible}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={handleBack}
            >
                <View
                    role="dialog"
                    aria-modal
                    accessibilityLabel={selectedFile?.name ?? t('directoryTree.title')}
                    style={[styles.mobileContainer, { backgroundColor: theme.colors.groupped.background }]}
                >
                    {/* Mobile header */}
                    <View style={styles.mobileHeader}>
                        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={handleBack} hitSlop={15} style={styles.mobileBackBtn}>
                            <Ionicons name="chevron-back" size={24} color={theme.colors.header.tint} />
                        </Pressable>
                        <Text style={styles.mobileTitle}>
                            {selectedFile?.name ?? ''}
                        </Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} hitSlop={10} style={styles.mobileCloseBtn}>
                            <Ionicons name="close" size={22} color={theme.colors.header.tint} />
                        </Pressable>
                    </View>

                    {/* Mobile content */}
                    {selectedFile ? (
                        <FilePreviewPanel
                            sessionId={sessionId}
                            machineId={machineId}
                            filePath={selectedFile.path}
                            fileName={selectedFile.name}
                            onClose={handleCloseFile}
                        />
                    ) : (
                        <DirectoryTreePanel
                            tree={tree}
                            isLoading={isLoading}
                            error={error}
                            expanded={expanded}
                            loadingPaths={loadingPaths}
                            onToggle={toggleNode}
                            onFileSelect={handleFileSelect}
                            onFileActions={openFileActions}
                            selectedFilePath={null}
                            onRetry={refresh}
                        />
                    )}
                    <ActionMenu
                        anchor={fileActions?.anchor ?? null}
                        items={fileActionItems}
                        onClose={() => setFileActions(null)}
                        title={fileActions?.node.name}
                        visible={!!fileActions}
                    />
                </View>
            </RNModal>
        );
    }

    // Desktop: inline animated drawer
    const animatedStyle = useAnimatedStyle(() => ({
        width: slideAnim.value * (selectedFile ? drawerWidth * 3 : drawerWidth),
        opacity: slideAnim.value,
        overflow: 'hidden' as const,
    }));

    if (!visible) {
        return null;
    }

    const totalWidth = selectedFile ? drawerWidth * 3 : drawerWidth;
    const treeWidth = selectedFile ? drawerWidth : totalWidth;

    return (
        <Animated.View style={[{ minWidth: 0, alignSelf: 'stretch' }, animatedStyle]}>
            <View style={[styles.desktopContent, { width: totalWidth }]}>
                <View style={[styles.desktopTree, { width: treeWidth }]}>
                    <DirectoryTreePanel
                        tree={tree}
                        isLoading={isLoading}
                        error={error}
                        expanded={expanded}
                        loadingPaths={loadingPaths}
                        onToggle={toggleNode}
                        onFileSelect={handleFileSelect}
                        onFileActions={openFileActions}
                        selectedFilePath={selectedFile?.path ?? null}
                        onClose={onClose}
                        onRetry={refresh}
                    />
                </View>
                {selectedFile && (
                    <View style={[styles.desktopPreview, { width: totalWidth - treeWidth }]}>
                        <FilePreviewPanel
                            sessionId={sessionId}
                            machineId={machineId}
                            filePath={selectedFile.path}
                            fileName={selectedFile.name}
                            onClose={handleCloseFile}
                        />
                    </View>
                )}
                <ActionMenu
                    anchor={fileActions?.anchor ?? null}
                    items={fileActionItems}
                    onClose={() => setFileActions(null)}
                    title={fileActions?.node.name}
                    visible={!!fileActions}
                />
            </View>
        </Animated.View>
    );
});

const styles = StyleSheet.create((theme, runtime) => ({
    // Mobile styles
    mobileContainer: {
        flex: 1,
    },
    mobileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingTop: runtime.insets.top,
        height: 44 + runtime.insets.top,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        backgroundColor: theme.colors.header.background,
    },
    mobileBackBtn: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mobileTitle: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.header.tint,
        ...Typography.default('semiBold'),
    },
    mobileCloseBtn: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Desktop styles
    desktopContent: {
        flex: 1,
        flexDirection: 'row',
    },
    desktopTree: {
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: theme.colors.divider,
    },
    desktopPreview: {
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: theme.colors.divider,
    },
}));
