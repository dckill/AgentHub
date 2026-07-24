import * as React from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionMenu, type ActionMenuAnchor, type ActionMenuItem } from '@/components/ActionMenu';
import { getActionMenuAnchorFromEvent } from '@/components/actionMenuPosition';
import { GlassButton } from '@/components/glass';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useItemScale } from '@/components/ItemScaleContext';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';
import { Typography } from '@/constants/Typography';
import { Modal } from '@/modal';
import { CenteredModalFrame } from '@/modal/components/CenteredModalFrame';
import { useAllMachines } from '@/sync/storage';
import { getTransferRootDirectoryUri, useFileTransferStore } from '@/sync/fileTransferStore';
import {
    filterTransferTasks,
    findTransferTaskById,
    formatTransferBytes,
    getCompletedTransferTaskIds,
    getDownloadDirectoryLabel,
    getTransferProgress,
    isFileTransferStatus,
    type FileTransferStatus,
    type FileTransferTask,
    type TransferTaskFilter,
} from '@/utils/fileTransfers';
import {
    buildAndroidDirectoryOpenPlan,
    buildAndroidFileOpenIntents,
    type AndroidIntentSpec,
} from '@/utils/androidFileIntents';
import { getAmberRaisedButtonVisuals } from '@/components/amberVisuals';
import { getDirectoryLabelFromSafUri } from '@/utils/downloadDirectoryPrompt';
import { t, type TranslationKey } from '@/text';

type StatusFilter = FileTransferStatus | 'active' | null;

type RemoveTransferDecision = {
    confirmed: boolean;
    deleteLocalFile: boolean;
};

const FILTERS: Array<{ key: StatusFilter; labelKey: TranslationKey }> = [
    { key: null, labelKey: 'transferManager.filterAll' },
    { key: 'active', labelKey: 'transferManager.filterActive' },
    { key: 'failed', labelKey: 'transferManager.filterFailed' },
    { key: 'paused', labelKey: 'transferManager.filterPaused' },
    { key: 'completed', labelKey: 'transferManager.filterCompleted' },
];

function getLocalizedTransferStatus(status: FileTransferStatus): string {
    const keys: Record<FileTransferStatus, TranslationKey> = {
        queued: 'transferManager.statusQueued',
        downloading: 'transferManager.statusDownloading',
        paused: 'transferManager.statusPaused',
        completed: 'transferManager.statusCompleted',
        failed: 'transferManager.statusFailed',
        cancelled: 'transferManager.statusCancelled',
    };
    return t(keys[status]);
}

function parseStatusFilter(value: string | string[] | undefined): StatusFilter {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === 'active' || isFileTransferStatus(raw)) {
        return raw;
    }
    return null;
}

function getMachineName(machine: ReturnType<typeof useAllMachines>[number] | undefined, machineId: string): string {
    if (!machine) {
        return machineId;
    }
    return machine.metadata?.displayName || machine.metadata?.host || machineId;
}

function formatLocalUri(uri: string | undefined): string {
    if (!uri) {
        return t('transferManager.notCompleted');
    }
    if (uri.startsWith('file://')) {
        return decodeURI(uri.replace('file://', ''));
    }
    if (uri.startsWith('content://')) {
        return t('transferManager.authorizedDirectory');
    }
    return uri;
}

async function toAndroidReadableUri(uri: string): Promise<string> {
    if (uri.startsWith('file://')) {
        return FileSystem.getContentUriAsync(uri);
    }
    return uri;
}

async function startAndroidIntentSequence(intents: AndroidIntentSpec[]): Promise<void> {
    let lastError: unknown;
    for (const intent of intents) {
        try {
            await IntentLauncher.startActivityAsync(intent.action, intent.params);
            return;
        } catch (error) {
            lastError = error;
        }
    }
    if (lastError instanceof Error) {
        throw lastError;
    }
    throw new Error(t('transferManager.noFileHandler'));
}

async function openLocalFile(task: FileTransferTask) {
    if (!task.localUri) {
        Modal.alert(t('transferManager.fileNotDownloaded'));
        return;
    }
    try {
        if (Platform.OS === 'android') {
            const openUri = await toAndroidReadableUri(task.localUri);
            await startAndroidIntentSequence(buildAndroidFileOpenIntents({
                fileName: task.fileName,
                uri: openUri,
            }));
            return;
        }
        await Linking.openURL(task.localUri);
    } catch (error) {
        Modal.alert(t('transferManager.cannotOpenFile'), error instanceof Error ? error.message : t('transferManager.unknownError'));
    }
}

async function openDirectory(directoryUri: string | undefined) {
    if (!directoryUri) {
        Modal.alert(t('transferManager.directoryUnavailable'));
        return;
    }
    try {
        if (Platform.OS === 'android') {
            const plan = buildAndroidDirectoryOpenPlan(directoryUri);
            if (plan.kind === 'unsupported-file-directory') {
                Modal.alert(
                    t('transferManager.cannotOpenDirectory'),
                    t('transferManager.privateDirectoryUnsupported'),
                );
                return;
            }
            await startAndroidIntentSequence(plan.intents);
            return;
        }
        await Linking.openURL(directoryUri);
    } catch (error) {
        Modal.alert(t('transferManager.cannotOpenDirectory'), error instanceof Error ? error.message : t('transferManager.noDirectoryHandler'));
    }
}

function getTaskDirectoryUri(task: FileTransferTask): string | undefined {
    if (task.localDirectoryUri) {
        return task.localDirectoryUri;
    }
    if (!task.localUri) {
        return undefined;
    }
    const separatorIndex = task.localUri.lastIndexOf('/');
    if (separatorIndex < 0) {
        return undefined;
    }
    return task.localUri.slice(0, separatorIndex + 1);
}

function getPrivateDownloadRootUri(): string | undefined {
    try {
        return getTransferRootDirectoryUri();
    } catch {
        return undefined;
    }
}

function getLocalizedTransferError(error: string | undefined): string | undefined {
    if (!error) {
        return undefined;
    }
    const normalized = error.toLowerCase();
    if (normalized.includes('directory') && normalized.includes('not available') && normalized.includes('platform')) {
        return t('transferManager.unavailableLocalDirectory');
    }
    return t('transferManager.unknownError');
}

function TransferTaskRow({
    task,
    machineName,
    onPress,
    onPause,
    onResume,
    onCancel,
    onRemove,
    showDivider,
}: {
    task: FileTransferTask;
    machineName: string;
    onPress: () => void;
    onPause: () => void;
    onResume: () => void;
    onCancel: () => void;
    onRemove: () => void;
    showDivider?: boolean;
}) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const s = useItemScale();
    const progress = getTransferProgress(task);
    const progressPercent = Math.round(progress * 100);
    const status = getLocalizedTransferStatus(task.status);
    const localizedError = getLocalizedTransferError(task.error);
    const taskAccessibilityLabel = [task.fileName, status, machineName, task.remotePath, localizedError]
        .filter((value): value is string => Boolean(value))
        .join(', ');
    const statusColor = task.status === 'failed'
        ? theme.colors.status.error
        : task.status === 'completed'
            ? theme.colors.success
            : task.status === 'downloading' || task.status === 'queued'
                ? theme.colors.accent
                : theme.colors.textSecondary;

    const action = (() => {
        if (task.status === 'downloading' || task.status === 'queued') {
            return <IconButton name="pause-outline" accessibilityLabel={t('transferManager.pauseDownload')} color={theme.colors.textSecondary} onPress={onPause} />;
        }
        if (task.status === 'failed') {
            return <IconButton name="refresh-outline" accessibilityLabel={t('common.retry')} color={theme.colors.accent} onPress={onResume} />;
        }
        if (task.status === 'paused') {
            return <IconButton name="play-outline" accessibilityLabel={t('transferManager.resumeDownload')} color={theme.colors.accent} onPress={onResume} />;
        }
        if (task.status === 'completed') {
            return <IconButton name="open-outline" accessibilityLabel={t('transferManager.openFile')} color={theme.colors.accent} onPress={() => openLocalFile(task)} />;
        }
        return null;
    })();

    return (
        <View style={[styles.taskRow, { minHeight: s(76) }]}>
            <Pressable
                accessibilityLabel={taskAccessibilityLabel}
                accessibilityRole="button"
                onPress={onPress}
                style={({ pressed }) => [
                    styles.taskMain,
                    {
                        paddingLeft: s(16),
                        paddingVertical: s(12),
                        backgroundColor: pressed ? theme.colors.surfaceSelected : 'transparent',
                    },
                ]}
            >
                <View style={[styles.taskIcon, { width: s(32), height: s(32), borderRadius: s(8), backgroundColor: `${statusColor}18` }]}>
                    <Ionicons name="document-outline" size={s(18)} color={statusColor} />
                </View>
                <View style={styles.taskBody}>
                <View style={styles.taskTitleRow}>
                    <Text style={[styles.taskTitle, { fontSize: s(15), lineHeight: s(20), color: theme.colors.text }]} numberOfLines={1}>
                        {task.fileName}
                    </Text>
                    <Text style={[styles.taskStatus, { fontSize: s(12), color: statusColor }]} numberOfLines={1}>
                        {status}
                    </Text>
                </View>
                <Text style={[styles.taskSubtitle, { fontSize: s(12), lineHeight: s(17), color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {machineName} · {task.remotePath}
                </Text>
                <View
                    accessibilityLabel={t('transferManager.progress')}
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={progressPercent}
                    style={[styles.progressTrack, { height: s(4), borderRadius: s(2), backgroundColor: theme.colors.divider }]}
                >
                    <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: statusColor }]} />
                </View>
                {task.status === 'failed' && localizedError ? (
                    <Text
                        accessibilityLiveRegion="polite"
                        style={[styles.taskMeta, { fontSize: s(11), color: theme.colors.status.error }]}
                        numberOfLines={2}
                    >
                        {localizedError}
                    </Text>
                ) : (
                    <Text style={[styles.taskMeta, { fontSize: s(11), color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {formatTransferBytes(task.downloadedBytes)} / {formatTransferBytes(task.totalBytes)}
                    </Text>
                )}
                </View>
            </Pressable>
            <View style={[styles.taskActions, { gap: s(6), paddingRight: s(8) }]}>
                {action}
                {(task.status === 'downloading' || task.status === 'queued' || task.status === 'paused') ? (
                    <IconButton name="close-circle-outline" accessibilityLabel={t('transferManager.cancelDownload')} color={theme.colors.status.error} onPress={onCancel} />
                ) : (
                    <IconButton name="trash-outline" accessibilityLabel={t('transferManager.removeTransfer')} color={theme.colors.textSecondary} onPress={onRemove} />
                )}
            </View>
            {showDivider && <View style={[styles.divider, { left: s(64), backgroundColor: theme.colors.divider }]} />}
        </View>
    );
}

function IconButton({
    accessibilityLabel,
    name,
    color,
    onPress,
}: {
    accessibilityLabel: string;
    name: keyof typeof Ionicons.glyphMap;
    color: string;
    onPress: () => void;
}) {
    const s = useItemScale();
    return (
        <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            hitSlop={8}
            onPress={(event) => {
                event.stopPropagation?.();
                onPress();
            }}
            style={{ width: s(44), height: s(44), borderRadius: s(12), alignItems: 'center', justifyContent: 'center' }}
        >
            <Ionicons name={name} size={s(22)} color={color} />
        </Pressable>
    );
}

function RemoveTransferModal({
    defaultDeleteLocalFile,
    onClose,
    onResolve,
    task,
}: {
    defaultDeleteLocalFile: boolean;
    onClose: () => void;
    onResolve: (decision: RemoveTransferDecision) => void;
    task: FileTransferTask;
}) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const [deleteLocalFile, setDeleteLocalFile] = React.useState(defaultDeleteLocalFile && Boolean(task.localUri));
    const canDeleteLocalFile = Boolean(task.localUri);
    const resolvedRef = React.useRef(false);

    const resolveAndClose = React.useCallback((decision: RemoveTransferDecision) => {
        resolvedRef.current = true;
        onResolve(decision);
        onClose();
    }, [onClose, onResolve]);

    React.useEffect(() => {
        return () => {
            if (!resolvedRef.current) {
                onResolve({ confirmed: false, deleteLocalFile: false });
            }
        };
    }, [onResolve]);

    return (
        <CenteredModalFrame
            maxWidth={430}
            footer={
                <>
                    <GlassButton
                        title={t('common.cancel')}
                        variant="secondary"
                        style={styles.removeModalFooterButton}
                        textStyle={Typography.default()}
                        onPress={() => resolveAndClose({ confirmed: false, deleteLocalFile: false })}
                    />
                    <GlassButton
                        title={deleteLocalFile ? t('transferManager.deleteRecordAndFile') : t('transferManager.deleteRecord')}
                        variant="danger"
                        style={styles.removeModalFooterButton}
                        onPress={() => resolveAndClose({ confirmed: true, deleteLocalFile })}
                    />
                </>
            }
        >
            <View style={styles.removeModalContent}>
                <Text style={[styles.removeModalTitle, { color: theme.colors.text }]}>
                    {t('transferManager.removeTitle')}
                </Text>
                <Text style={[styles.removeModalMessage, { color: theme.colors.textSecondary }]}>
                    {task.fileName}
                </Text>
                <Text style={[styles.removeModalDescription, { color: theme.colors.textSecondary }]}>
                    {t('transferManager.removeDescription')}
                </Text>
                {canDeleteLocalFile ? (
                    <Pressable
                        accessibilityLabel={t('transferManager.deleteLocalFile')}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: deleteLocalFile }}
                        {...Platform.select({ web: { 'aria-checked': deleteLocalFile } as any })}
                        {...getSpaceKeyActivationProps(() => setDeleteLocalFile(value => !value))}
                        onPress={() => setDeleteLocalFile(value => !value)}
                        style={({ pressed }) => [
                            styles.removeModalCheckboxRow,
                            {
                                backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.input.background,
                                borderColor: deleteLocalFile ? theme.colors.textDestructive : theme.colors.glass.border,
                            },
                        ]}
                    >
                        <View
                            style={[
                                styles.removeModalCheckbox,
                                {
                                    backgroundColor: deleteLocalFile ? theme.colors.textDestructive : 'transparent',
                                    borderColor: deleteLocalFile ? theme.colors.textDestructive : theme.colors.textSecondary,
                                },
                            ]}
                        >
                            {deleteLocalFile && (
                                <Ionicons name="checkmark" size={15} color={theme.colors.button.primary.tint} />
                            )}
                        </View>
                        <View style={styles.removeModalCheckboxText}>
                            <Text style={[styles.removeModalCheckboxLabel, { color: theme.colors.text }]}>
                                {t('transferManager.deleteLocalFile')}
                            </Text>
                            <Text style={[styles.removeModalCheckboxHint, { color: theme.colors.textSecondary }]}>
                                {t('transferManager.deleteLocalFileHint')}
                            </Text>
                        </View>
                    </Pressable>
                ) : (
                    <Text style={[styles.removeModalDescription, { color: theme.colors.textSecondary }]}>
                        {t('transferManager.noLocalFile')}
                    </Text>
                )}
            </View>
        </CenteredModalFrame>
    );
}

function TransferFilterTabs({
    accessibilityLabel,
    machineId,
    onSelect,
    statusFilter,
    tasks,
}: {
    accessibilityLabel: string;
    machineId: string | null;
    onSelect: (filter: StatusFilter) => void;
    statusFilter: StatusFilter;
    tasks: FileTransferTask[];
}) {
    const { theme } = useUnistyles();
    const { width } = useWindowDimensions();
    const s = useItemScale();
    const styles = stylesheet;
    const amberVisuals = getAmberRaisedButtonVisuals(theme);
    const compactFilters = width < 480;

    return (
        <View
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="tablist"
            style={[styles.tabsWrapper, { paddingHorizontal: s(12), paddingTop: s(12), paddingBottom: s(4) }]}
        >
            <View style={[styles.tabsScroller, { gap: s(8), paddingHorizontal: s(4) }]}>
                {FILTERS.map((filter) => {
                    const selected = statusFilter === filter.key;
                    const count = filterTransferTasks(tasks, { machineId, status: filter.key }).length;
                    return (
                        <Pressable
                            key={filter.key ?? 'all'}
                            accessibilityRole="tab"
                            accessibilityState={{ selected }}
                            aria-selected={selected}
                            onPress={() => onSelect(filter.key)}
                            style={({ pressed }) => [
                                styles.filterTab,
                                {
                                    flexBasis: compactFilters ? '45%' : '30%',
                                    minWidth: s(84),
                                    minHeight: s(44),
                                    paddingHorizontal: s(12),
                                    borderRadius: s(12),
                                    borderColor: selected ? amberVisuals.borderColor : theme.colors.glass.border,
                                    backgroundColor: selected
                                        ? theme.colors.accent
                                        : pressed
                                            ? theme.colors.surfaceSelected
                                            : theme.colors.input.background,
                                },
                            ]}
                        >
                            {selected ? (
                                <>
                                    <LinearGradient
                                        pointerEvents="none"
                                        colors={amberVisuals.colors}
                                        start={{ x: 0.1, y: 0 }}
                                        end={{ x: 0.92, y: 1 }}
                                        style={StyleSheet.absoluteFill}
                                    />
                                    <View
                                        pointerEvents="none"
                                        style={[styles.filterTabHighlight, { backgroundColor: amberVisuals.highlightColor }]}
                                    />
                                </>
                            ) : null}
                            <Text
                                numberOfLines={2}
                                style={[
                                    styles.filterTabLabel,
                                    {
                                        fontSize: s(13),
                                        color: selected ? amberVisuals.textColor : theme.colors.textSecondary,
                                    },
                                ]}
                            >
                                {t(filter.labelKey)}
                            </Text>
                            <Text
                                numberOfLines={1}
                                style={[
                                    styles.filterTabCount,
                                    {
                                        fontSize: s(12),
                                        color: selected ? amberVisuals.textColor : theme.colors.textSecondary,
                                    },
                                ]}
                            >
                                {count}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

function DetailRow({
    label,
    value,
    onPress,
}: {
    label: string;
    value: string;
    onPress?: () => void;
}) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const content = (
        <>
            <View style={styles.detailLabelRow}>
                <Text style={[styles.detailLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
                {onPress && (
                    <Ionicons name="folder-open-outline" size={18} color={theme.colors.accent} />
                )}
            </View>
            <Text style={[styles.detailValue, { color: theme.colors.text }]} selectable>
                {value}
            </Text>
        </>
    );

    if (onPress) {
        return (
            <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                onPress={onPress}
                style={({ pressed }) => [
                    styles.detailRow,
                    {
                        backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.surfaceHigh,
                        borderColor: theme.colors.divider,
                    },
                ]}
            >
                {content}
            </Pressable>
        );
    }

    return (
        <View style={[styles.detailRow, { backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.divider }]}>
            {content}
        </View>
    );
}

function DetailActionButton({
    icon,
    label,
    onPress,
    primary,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    primary?: boolean;
}) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const amberVisuals = getAmberRaisedButtonVisuals(theme);
    return (
        <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => [
                styles.detailActionButton,
                {
                    backgroundColor: primary ? theme.colors.button.primary.background : theme.colors.glass.background,
                    borderColor: primary ? amberVisuals.borderColor : theme.colors.glass.border,
                    opacity: pressed ? 0.78 : 1,
                },
            ]}
        >
            {primary ? (
                <>
                    <LinearGradient
                        pointerEvents="none"
                        colors={amberVisuals.colors}
                        start={{ x: 0.12, y: 0 }}
                        end={{ x: 0.95, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.detailActionHighlight, { backgroundColor: amberVisuals.highlightColor }]} />
                </>
            ) : null}
            <Ionicons
                name={icon}
                size={18}
                color={primary ? theme.colors.button.primary.tint : theme.colors.accent}
            />
            <Text
                style={[
                    styles.detailActionText,
                    { color: primary ? theme.colors.button.primary.tint : theme.colors.accent },
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </Pressable>
    );
}

function TransferTaskDetailModal({
    machineName,
    onClose,
    onOpenDirectory,
    onOpenFile,
    task,
}: {
    machineName: string;
    onClose: () => void;
    onOpenDirectory: () => void;
    onOpenFile: () => void;
    task: FileTransferTask;
}) {
    const { theme } = useUnistyles();
    const { width } = useWindowDimensions();
    const styles = stylesheet;
    const localPath = task.localUri
        ? task.localUri.startsWith('content://')
            ? `${task.localDirectoryLabel || t('transferManager.authorizedDirectory')}`
            : formatLocalUri(task.localUri)
        : t('transferManager.notCompleted');

    return (
        <View
            style={[
                styles.detailModal,
                {
                    width: Math.min(width - 24, 560),
                    backgroundColor: theme.colors.surfaceRaised,
                    borderColor: theme.colors.glass.borderStrong,
                    shadowColor: theme.colors.glass.shadow,
                },
            ]}
        >
            <LinearGradient
                pointerEvents="none"
                colors={theme.dark
                    ? ['rgba(255, 190, 74, 0.10)', 'rgba(31, 39, 44, 0.84)', 'rgba(16, 20, 22, 0.98)']
                    : ['rgba(255, 247, 224, 0.94)', theme.colors.surfaceRaised, theme.colors.canvasElevated]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={[styles.detailHeader, { borderBottomColor: theme.colors.borderStrong }]}>
                <View style={[styles.detailHeaderIcon, { backgroundColor: `${theme.colors.accent}22` }]}>
                    <Ionicons name="swap-vertical-outline" size={20} color={theme.colors.accent} />
                </View>
                <View style={styles.detailHeaderText}>
                    <Text style={[styles.detailTitle, { color: theme.colors.text }]} numberOfLines={1}>
                        {t('transferManager.detailTitle')}
                    </Text>
                    <Text style={[styles.detailSubtitle, { color: theme.colors.textSecondary }]}>
                        {task.fileName}
                    </Text>
                </View>
            </View>

            <ScrollView
                accessibilityLabel={t('transferManager.detailTitle')}
                role="region"
                tabIndex={0}
                style={styles.detailScroll}
                contentContainerStyle={styles.detailRows}
            >
                <DetailRow label={t('transferManager.file')} value={task.fileName} />
                <DetailRow label={t('transferManager.status')} value={getLocalizedTransferStatus(task.status)} />
                <DetailRow label={t('transferManager.device')} value={machineName} />
                <DetailRow label={t('transferManager.remotePath')} value={task.remotePath} />
                <DetailRow label={t('transferManager.localPath')} value={localPath} onPress={task.localUri ? onOpenDirectory : undefined} />
                <DetailRow
                    label={t('transferManager.progress')}
                    value={`${formatTransferBytes(task.downloadedBytes)} / ${formatTransferBytes(task.totalBytes)}`}
                />
                {task.error && <DetailRow label={t('transferManager.error')} value={getLocalizedTransferError(task.error) ?? t('transferManager.unknownError')} />}
                <DetailRow label={t('transferManager.createdAt')} value={new Date(task.createdAt).toLocaleString()} />
                <DetailRow label={t('transferManager.updatedAt')} value={new Date(task.updatedAt).toLocaleString()} />
            </ScrollView>

            <View style={[styles.detailActions, { borderTopColor: theme.colors.divider }]}>
                {task.localUri && (
                    <>
                        <DetailActionButton icon="open-outline" label={t('transferManager.openFile')} primary onPress={onOpenFile} />
                        <DetailActionButton icon="folder-open-outline" label={t('transferManager.openDirectory')} onPress={onOpenDirectory} />
                    </>
                )}
                <DetailActionButton icon="close-outline" label={t('transferManager.close')} onPress={onClose} />
            </View>
        </View>
    );
}

export default function TransfersScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const params = useLocalSearchParams<{ machineId?: string; status?: string; taskId?: string | string[] }>();
    const tasks = useFileTransferStore(state => state.tasks);
    const settings = useFileTransferStore(state => state.settings);
    const pauseTask = useFileTransferStore(state => state.pauseTask);
    const cancelTask = useFileTransferStore(state => state.cancelTask);
    const retryTask = useFileTransferStore(state => state.retryTask);
    const removeTask = useFileTransferStore(state => state.removeTask);
    const clearCompletedTasks = useFileTransferStore(state => state.clearCompletedTasks);
    const setDownloadDirectory = useFileTransferStore(state => state.setDownloadDirectory);
    const setDeleteLocalFileOnRemove = useFileTransferStore(state => state.setDeleteLocalFileOnRemove);
    const machines = useAllMachines({ includeOffline: true });
    const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(() => parseStatusFilter(params.status));
    const [menuAnchor, setMenuAnchor] = React.useState<ActionMenuAnchor | null>(null);
    const openedTaskIdRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        setStatusFilter(parseStatusFilter(params.status));
    }, [params.status]);

    const machineId = typeof params.machineId === 'string' ? params.machineId : null;
    const machineMap = React.useMemo(() => new Map(machines.map(machine => [machine.id, machine])), [machines]);
    const currentFilter = React.useMemo<TransferTaskFilter>(() => ({ machineId, status: statusFilter }), [machineId, statusFilter]);
    const filteredTasks = React.useMemo(() => {
        return filterTransferTasks(tasks, currentFilter)
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }, [currentFilter, tasks]);

    const title = machineId
        ? t('transferManager.machineTitle', { machine: getMachineName(machineMap.get(machineId), machineId) })
        : t('transferManager.title');

    const showTaskDetail = React.useCallback((task: FileTransferTask) => {
        Modal.show({
            component: TransferTaskDetailModal,
            frame: false,
            accessibilityLabel: t('transferManager.detailTitle'),
            props: {
                task,
                machineName: getMachineName(machineMap.get(task.machineId), task.machineId),
                onOpenFile: () => openLocalFile(task),
                onOpenDirectory: () => openDirectory(getTaskDirectoryUri(task)),
            },
        });
    }, [machineMap]);

    React.useEffect(() => {
        const task = findTransferTaskById(tasks, params.taskId);
        if (!task || openedTaskIdRef.current === task.id) {
            return;
        }
        openedTaskIdRef.current = task.id;
        showTaskDetail(task);
    }, [params.taskId, showTaskDetail, tasks]);

    const openDefaultDirectory = React.useCallback(() => {
        const directoryUri = settings.downloadDirectoryUri || getPrivateDownloadRootUri();
        openDirectory(directoryUri);
    }, [settings.downloadDirectoryUri]);

    const showDownloadDirectory = React.useCallback(() => {
        const directoryUri = settings.downloadDirectoryUri || getPrivateDownloadRootUri();
        const label = getDownloadDirectoryLabel(settings, t('transferManager.appPrivateDirectory'));
        const permissionText = settings.downloadDirectoryUri
            ? t('transferManager.authorizedDirectoryDescription')
            : t('transferManager.privateDirectoryDescription');
        Modal.alert(t('transferManager.defaultLocation'), `${label}\n${directoryUri ? formatLocalUri(directoryUri) : t('transferManager.unavailableLocalDirectory')}\n\n${permissionText}`);
    }, [settings]);

    const chooseDownloadDirectory = React.useCallback(async () => {
        if (Platform.OS !== 'android') {
            Modal.alert(t('transferManager.unsupportedDirectoryTitle'), t('transferManager.unsupportedDirectoryMessage'));
            return;
        }

        try {
            const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
            const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
            if (!result.granted) {
                return;
            }
            const label = getDirectoryLabelFromSafUri(result.directoryUri);
            setDownloadDirectory({
                downloadDirectoryUri: result.directoryUri,
                downloadDirectoryLabel: label,
            });
            Modal.alert(t('transferManager.locationUpdated'), t('transferManager.locationUpdatedMessage', { label }));
        } catch (error) {
            Modal.alert(t('transferManager.cannotSetDirectory'), error instanceof Error ? error.message : t('transferManager.unknownError'));
        }
    }, [setDownloadDirectory]);

    const resetDownloadDirectory = React.useCallback(async () => {
        const confirmed = await Modal.confirm(t('transferManager.restorePrivateTitle'), t('transferManager.restorePrivateMessage'), {
            cancelText: t('common.cancel'),
            confirmText: t('transferManager.restore'),
        });
        if (confirmed) {
            setDownloadDirectory({});
        }
    }, [setDownloadDirectory]);

    const completedTaskIds = React.useMemo(() => getCompletedTransferTaskIds(tasks, currentFilter), [currentFilter, tasks]);
    const handleClearCompleted = React.useCallback(async () => {
        const count = completedTaskIds.length;
        if (count === 0) {
            Modal.alert(t('transferManager.nothingToClear'));
            return;
        }
        const confirmed = await Modal.confirm(
            t('transferManager.clearCompletedTitle'),
            t('transferManager.clearCompletedMessage', { count }),
            {
                cancelText: t('common.cancel'),
                confirmText: t('transferManager.clear'),
                destructive: true,
            },
        );
        if (confirmed) {
            clearCompletedTasks(currentFilter);
        }
    }, [clearCompletedTasks, completedTaskIds.length, currentFilter]);

    const handleRemoveTask = React.useCallback(async (task: FileTransferTask) => {
        const decision = await new Promise<RemoveTransferDecision>((resolve) => {
            Modal.show({
                component: RemoveTransferModal,
                frame: false,
                accessibilityLabel: t('transferManager.removeTitle'),
                props: {
                    task,
                    defaultDeleteLocalFile: settings.deleteLocalFileOnRemove === true,
                    onResolve: resolve,
                },
            });
        });
        if (!decision.confirmed) {
            return;
        }

        if (task.localUri) {
            setDeleteLocalFileOnRemove(decision.deleteLocalFile);
        }

        try {
            await removeTask(task.id, { deleteLocalFile: decision.deleteLocalFile });
        } catch (error) {
            Modal.alert(t('transferManager.deleteLocalFailed'), error instanceof Error ? error.message : t('transferManager.unknownError'));
        }
    }, [removeTask, setDeleteLocalFileOnRemove, settings.deleteLocalFileOnRemove]);

    const menuItems = React.useMemo<ActionMenuItem[]>(() => [
        {
            id: 'show-directory',
            icon: 'information-circle-outline',
            label: t('transferManager.showDefaultLocation'),
            onPress: showDownloadDirectory,
        },
        {
            id: 'open-directory',
            icon: 'folder-open-outline',
            label: t('transferManager.openDefaultLocation'),
            onPress: openDefaultDirectory,
        },
        {
            id: 'choose-directory',
            icon: 'folder-outline',
            label: Platform.OS === 'android' ? t('transferManager.chooseDefaultLocation') : t('transferManager.chooseDefaultLocationAndroid'),
            disabled: Platform.OS !== 'android',
            onPress: chooseDownloadDirectory,
        },
        {
            id: 'reset-directory',
            icon: 'refresh-outline',
            label: t('transferManager.restorePrivateDirectory'),
            disabled: !settings.downloadDirectoryUri,
            onPress: resetDownloadDirectory,
        },
        {
            id: 'clear-completed',
            icon: 'trash-outline',
            label: completedTaskIds.length > 0 ? t('transferManager.clearCompletedCount', { count: completedTaskIds.length }) : t('transferManager.clearCompleted'),
            destructive: true,
            disabled: completedTaskIds.length === 0,
            onPress: handleClearCompleted,
        },
    ], [
        chooseDownloadDirectory,
        completedTaskIds.length,
        handleClearCompleted,
        openDefaultDirectory,
        resetDownloadDirectory,
        settings.downloadDirectoryUri,
        showDownloadDirectory,
    ]);

    const selectStatusFilter = React.useCallback((filter: StatusFilter) => {
        setStatusFilter(filter);
    }, []);

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: title,
                    headerBackTitle: t('transferManager.devices'),
                    headerRight: () => (
                        <Pressable
                            accessibilityLabel={t('transferManager.management')}
                            accessibilityRole="button"
                            hitSlop={10}
                            onPress={(event) => {
                                event.stopPropagation?.();
                                setMenuAnchor(getActionMenuAnchorFromEvent(event));
                            }}
                            style={({ pressed }) => [
                                styles.headerMenuButton,
                                {
                                    backgroundColor: pressed ? theme.colors.surfaceSelected : 'transparent',
                                },
                            ]}
                        >
                            <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.textSecondary} />
                        </Pressable>
                    ),
                }}
            />
            <ItemList role="main">
                <Text role="heading" aria-level={1} style={styles.screenReaderHeading}>
                    {title}
                </Text>
                <TransferFilterTabs
                    accessibilityLabel={title}
                    machineId={machineId}
                    onSelect={selectStatusFilter}
                    statusFilter={statusFilter}
                    tasks={tasks}
                />

                <ItemGroup title={machineId ? t('transferManager.currentDevice') : t('transferManager.allDevices')}>
                    {filteredTasks.length === 0 ? (
                        <Item
                            title={t('transferManager.noTasks')}
                            titleLines={0}
                            subtitle={t('transferManager.noTasksSubtitle')}
                            subtitleLines={0}
                            showChevron={false}
                        />
                    ) : (
                        filteredTasks.map((task) => (
                            <TransferTaskRow
                                key={task.id}
                                task={task}
                                machineName={getMachineName(machineMap.get(task.machineId), task.machineId)}
                                onPress={() => showTaskDetail(task)}
                                onPause={() => pauseTask(task.id)}
                                onResume={() => retryTask(task.id)}
                                onCancel={async () => {
                                    const confirmed = await Modal.confirm(t('transferManager.cancelDownloadTitle'), task.fileName, {
                                        cancelText: t('transferManager.keepDownload'),
                                        confirmText: t('transferManager.cancelDownload'),
                                        destructive: true,
                                    });
                                    if (confirmed) cancelTask(task.id);
                                }}
                                onRemove={() => handleRemoveTask(task)}
                            />
                        ))
                    )}
                </ItemGroup>
            </ItemList>
            <ActionMenu
                anchor={menuAnchor}
                items={menuItems}
                onClose={() => setMenuAnchor(null)}
                title={t('transferManager.management')}
                visible={!!menuAnchor}
            />
        </>
    );
}

const stylesheet = StyleSheet.create((theme) => ({
    screenReaderHeading: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
    },
    headerMenuButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabsWrapper: {
        width: '100%',
    },
    tabsScroller: {
        width: '100%',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'stretch',
    },
    filterTab: {
        flexGrow: 1,
        flexBasis: '30%',
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    filterTabHighlight: {
        position: 'absolute',
        top: 2,
        left: 9,
        right: 9,
        height: 9,
        borderRadius: 999,
        opacity: 0.82,
    },
    filterTabLabel: {
        ...Typography.default('semiBold'),
    },
    filterTabCount: {
        marginTop: 1,
        ...Typography.default(),
    },
    taskRow: {
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    taskMain: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
    },
    taskIcon: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    taskBody: {
        flex: 1,
        minWidth: 0,
    },
    taskTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    taskTitle: {
        flex: 1,
        ...Typography.default('semiBold'),
    },
    taskStatus: {
        ...Typography.default('semiBold'),
    },
    taskSubtitle: {
        marginTop: 1,
        ...Typography.default(),
    },
    progressTrack: {
        marginTop: 8,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    taskMeta: {
        marginTop: 5,
        ...Typography.default(),
    },
    taskActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 8,
    },
    divider: {
        position: 'absolute',
        right: 0,
        bottom: 0,
        height: StyleSheet.hairlineWidth,
    },
    removeModalContent: {
        width: '100%',
        gap: 10,
    },
    removeModalTitle: {
        fontSize: 18,
        lineHeight: 24,
        ...Typography.default('semiBold'),
    },
    removeModalMessage: {
        fontSize: 14,
        lineHeight: 20,
        ...Typography.default(),
        ...Platform.select({
            web: {
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
            } as any,
        }),
    },
    removeModalDescription: {
        fontSize: 13,
        lineHeight: 19,
        ...Typography.default(),
    },
    removeModalCheckboxRow: {
        marginTop: 4,
        minHeight: 74,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 11,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
    },
    removeModalCheckbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    removeModalCheckboxText: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    removeModalCheckboxLabel: {
        fontSize: 14,
        lineHeight: 19,
        ...Typography.default('semiBold'),
    },
    removeModalCheckboxHint: {
        fontSize: 12,
        lineHeight: 17,
        ...Typography.default(),
    },
    removeModalFooterButton: {
        flex: 1,
    },
    detailModal: {
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
        maxHeight: '86%',
        shadowOpacity: 0.26,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 18 },
        elevation: 18,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 18,
        paddingVertical: 16,
        gap: 12,
    },
    detailHeaderIcon: {
        width: 38,
        height: 38,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailHeaderText: {
        flex: 1,
        minWidth: 0,
    },
    detailTitle: {
        fontSize: 17,
        lineHeight: 22,
        ...Typography.default('semiBold'),
    },
    detailSubtitle: {
        marginTop: 2,
        fontSize: 13,
        lineHeight: 18,
        flexShrink: 1,
        ...Typography.default(),
    },
    detailScroll: {
        maxHeight: 420,
    },
    detailRows: {
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 9,
    },
    detailRow: {
        minHeight: 52,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 5,
    },
    detailLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    detailLabel: {
        fontSize: 13,
        lineHeight: 19,
        ...Typography.default('semiBold'),
    },
    detailValue: {
        width: '100%',
        minWidth: 0,
        flexShrink: 1,
        flexWrap: 'wrap',
        fontSize: 13,
        lineHeight: 19,
        ...Typography.default(),
        ...Platform.select({
            web: {
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
            } as any,
        }),
    },
    detailActions: {
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    detailActionButton: {
        minHeight: 44,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 13,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 140,
        minWidth: 116,
        overflow: 'hidden',
    },
    detailActionHighlight: {
        position: 'absolute',
        left: 7,
        right: 7,
        top: 3,
        height: 10,
        borderRadius: 999,
        opacity: 0.82,
    },
    detailActionText: {
        fontSize: 14,
        lineHeight: 18,
        ...Typography.default('semiBold'),
    },
}));
