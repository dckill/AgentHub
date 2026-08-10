import * as React from 'react';
import { View, Text, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { SvgXml } from 'react-native-svg';
import Octicons from '@expo/vector-icons/Octicons';
import { FileIcon } from '@/components/FileIcon';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useFileScale } from '@/hooks/useScale';
import { Modal } from '@/modal';
import { useFileTransferStore } from '@/sync/fileTransferStore';
import { sync } from '@/sync/sync';
import { ensureDownloadDirectoryBeforeStart } from '@/utils/downloadDirectoryPrompt';
import { useRouter } from 'expo-router';
import { classifyFilePreview } from '@/utils/filePreviewPolicy';
import type { FilePreviewClassification } from '@/utils/filePreviewPolicy';
import { MarkdownView } from './markdown/MarkdownView';
import type { DirectoryTreeSourceDescriptor } from '@/utils/directoryTreeSource';
import { detectLanguageFromPath, isMarkdownFilePath } from '@/utils/fileLanguage';
import { formatFileSize as formatSize, loadFilePreviewContent } from '@/utils/filePreviewLoader';
import type { FilePreviewSource } from '@/utils/filePreviewLoader';
import { getMarkdownFilePreviewContent, loadMarkdownImageMapForFile } from '@/utils/markdownFilePreview';

interface FilePreviewPanelProps {
    sessionId?: string | null;
    machineId?: string | null;
    source?: DirectoryTreeSourceDescriptor;
    filePath: string;
    fileName: string;
    onClose: () => void;
}

type ResolvedFileSource = {
    kind: DirectoryTreeSourceDescriptor['kind'];
    id: string;
};

function resolveFilePreviewSource(
    source: DirectoryTreeSourceDescriptor | undefined,
    sessionId?: string | null,
    machineId?: string | null,
): ResolvedFileSource | null {
    if (source?.kind === 'session') {
        return { kind: 'session', id: source.sessionId };
    }
    if (source?.kind === 'machine') {
        return { kind: 'machine', id: source.machineId };
    }
    if (sessionId) {
        return { kind: 'session', id: sessionId };
    }
    if (machineId) {
        return { kind: 'machine', id: machineId };
    }
    return null;
}

interface FileState {
    content: string;
    isBinary: boolean;
    error: string | null;
    isLoading: boolean;
    truncated: boolean;
    previewKind: FilePreviewClassification['kind'];
    imageUri?: string;
    skippedLargeFile: boolean;
    totalSize?: number;
}

export const FilePreviewPanel = React.memo<FilePreviewPanelProps>(({
    sessionId,
    machineId,
    source,
    filePath,
    fileName,
    onClose,
}) => {
    const router = useRouter();
    const enqueueDownloadPaused = useFileTransferStore(store => store.enqueueDownloadPaused);
    const startDownload = useFileTransferStore(store => store.startDownload);
    const transferSettings = useFileTransferStore(store => store.settings);
    const setDownloadDirectory = useFileTransferStore(store => store.setDownloadDirectory);
    const [markdownMode, setMarkdownMode] = React.useState<'source' | 'preview'>('source');
    const [markdownImageMap, setMarkdownImageMap] = React.useState<Record<string, string>>({});
    const [state, setState] = React.useState<FileState>({
        content: '',
        isBinary: false,
        error: null,
        isLoading: true,
        truncated: false,
        previewKind: 'text',
        skippedLargeFile: false,
    });
    const fileSource = React.useMemo(() => resolveFilePreviewSource(source, sessionId, machineId), [machineId, sessionId, source]);
    const sourceKind = fileSource?.kind ?? null;
    const sourceId = fileSource?.id ?? null;
    const previewSource = React.useMemo<FilePreviewSource | null>(() => {
        if (!sourceKind || !sourceId) return null;
        return { kind: sourceKind, id: sourceId };
    }, [sourceId, sourceKind]);

    React.useEffect(() => {
        let cancelled = false;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => !cancelled && generation !== null && sync.getAccountGeneration() === generation;
        const preview = classifyFilePreview(filePath);

        if (preview.kind === 'binary') {
            if (isCurrent()) {
                setState({ content: '', isBinary: true, error: null, isLoading: false, truncated: false, previewKind: 'binary', skippedLargeFile: false });
            }
            return;
        }
        if (!previewSource) {
            if (isCurrent()) {
                setState({ content: '', isBinary: false, error: t('fileBrowser.missingReadSource'), isLoading: false, truncated: false, previewKind: preview.kind, skippedLargeFile: false });
            }
            return;
        }

        const load = async () => {
            try {
                if (!isCurrent()) return;
                setState((prev) => ({
                    ...prev,
                    isLoading: true,
                    error: null,
                    skippedLargeFile: false,
                    imageUri: undefined,
                }));
                const loaded = await loadFilePreviewContent({
                    source: previewSource,
                    filePath,
                    fileName,
                    confirmLargeFile: ({ size }) => Modal.confirm(
                        t('files.largeFileTitle'),
                        t('files.largeFileMessage', { fileName, size }),
                        {
                            cancelText: t('files.largeFileCancel'),
                            confirmText: t('files.largeFileConfirm'),
                        }
                    ),
                });
                if (!isCurrent()) return;
                setState({
                    content: loaded.content,
                    isBinary: loaded.isBinary,
                    error: null,
                    isLoading: false,
                    truncated: loaded.truncated,
                    previewKind: loaded.previewKind,
                    imageUri: loaded.imageUri,
                    skippedLargeFile: loaded.skippedLargeFile,
                    totalSize: loaded.totalSize,
                });
            } catch (e) {
                if (isCurrent()) {
                    setState({ content: '', isBinary: false, error: t('directoryTree.loadFailed'), isLoading: false, truncated: false, previewKind: preview.kind, skippedLargeFile: false });
                }
            }
        };

        load();
        return () => { cancelled = true; };
    }, [fileName, filePath, previewSource]);

    const { theme } = useUnistyles();
    const { scale, s } = useFileScale();
    const language = detectLanguageFromPath(filePath);
    const isMarkdownFile = isMarkdownFilePath(filePath);
    const canPreviewMarkdown = isMarkdownFile && !!state.content && !state.isBinary;
    const downloadMachineId = machineId ?? (sourceKind === 'machine' ? sourceId : null);
    const handleDownload = React.useCallback(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;
        if (!downloadMachineId) {
            Modal.alert(t('common.error'), t('fileBrowser.missingMachineForDownload'));
            return;
        }
        const canDownload = await ensureDownloadDirectoryBeforeStart(transferSettings, setDownloadDirectory);
        if (!canDownload || !isCurrent()) {
            return;
        }
        const taskId = enqueueDownloadPaused({
            machineId: downloadMachineId,
            sessionId: sourceKind === 'session' ? sourceId ?? undefined : sessionId ?? undefined,
            remotePath: filePath,
            fileName,
            size: state.totalSize,
        });
        startDownload(taskId);
        if (!isCurrent()) return;
        Modal.alert(t('fileBrowser.queuedTitle'), fileName, [
            {
                text: t('fileBrowser.view'),
                onPress: () => router.push(`/transfers?machineId=${encodeURIComponent(downloadMachineId)}&taskId=${encodeURIComponent(taskId)}` as any),
            },
            { text: t('common.ok') },
        ]);
    }, [
        downloadMachineId,
        enqueueDownloadPaused,
        fileName,
        filePath,
        router,
        sessionId,
        setDownloadDirectory,
        sourceId,
        sourceKind,
        startDownload,
        state.totalSize,
        transferSettings,
    ]);
    const markdownPreviewContent = React.useMemo(() => {
        if (!canPreviewMarkdown) return state.content;
        return getMarkdownFilePreviewContent(state.content, markdownImageMap);
    }, [canPreviewMarkdown, markdownImageMap, state.content]);

    React.useEffect(() => {
        if (!canPreviewMarkdown || !previewSource) {
            setMarkdownImageMap({});
            return;
        }

        let cancelled = false;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => !cancelled && generation !== null && sync.getAccountGeneration() === generation;
        setMarkdownImageMap({});
        loadMarkdownImageMapForFile({
            markdown: state.content,
            markdownFilePath: filePath,
            source: previewSource,
        }).then((map) => {
            if (isCurrent()) setMarkdownImageMap(map);
        }).catch(() => {
            if (isCurrent()) setMarkdownImageMap({});
        });

        return () => { cancelled = true; };
    }, [canPreviewMarkdown, filePath, previewSource, state.content]);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.fileHeader}>
                <FileIcon fileName={fileName} size={s(27)} />
                <Text style={[styles.filePath, { fontSize: s(12) }]} numberOfLines={1}>{filePath}</Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('fileBrowser.downloadToDevice')}
                    onPress={handleDownload}
                    hitSlop={10}
                    style={styles.closeBtn}
                >
                    <Octicons name="download" size={s(16)} color={theme.colors.textSecondary} />
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.close')}
                    onPress={onClose}
                    hitSlop={10}
                    style={styles.closeBtn}
                >
                    <Octicons name="x" size={s(16)} color={theme.colors.textSecondary} />
                </Pressable>
            </View>

            {/* Truncation banner */}
            {state.truncated && state.totalSize != null && (
                <View style={styles.truncatedBanner}>
                    <Text style={[styles.truncatedText, { fontSize: s(12) }]}>
                        {t('directoryTree.fileTruncated', { loaded: formatSize(state.content.length), total: formatSize(state.totalSize) })}
                    </Text>
                </View>
            )}

            {canPreviewMarkdown && (
                <View accessibilityRole="tablist" style={styles.markdownToggle}>
                    <Pressable
                        accessibilityRole="tab"
                        accessibilityLabel={t('files.source')}
                        accessibilityState={{ selected: markdownMode === 'source' }}
                        aria-selected={markdownMode === 'source'}
                        onPress={() => setMarkdownMode('source')}
                        style={[styles.markdownModeButton, {
                            borderRadius: s(8),
                            backgroundColor: markdownMode === 'source' ? theme.colors.textLink : theme.colors.input.background,
                        }]}
                    >
                        <Text style={{
                            fontSize: s(13),
                            color: markdownMode === 'source' ? 'white' : theme.colors.textSecondary,
                            ...Typography.default('semiBold'),
                        }}>
                            {t('files.source')}
                        </Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="tab"
                        accessibilityLabel={t('files.preview')}
                        accessibilityState={{ selected: markdownMode === 'preview' }}
                        aria-selected={markdownMode === 'preview'}
                        onPress={() => setMarkdownMode('preview')}
                        style={[styles.markdownModeButton, {
                            borderRadius: s(8),
                            backgroundColor: markdownMode === 'preview' ? theme.colors.textLink : theme.colors.input.background,
                        }]}
                    >
                        <Text style={{
                            fontSize: s(13),
                            color: markdownMode === 'preview' ? 'white' : theme.colors.textSecondary,
                            ...Typography.default('semiBold'),
                        }}>
                            {t('files.preview')}
                        </Text>
                    </Pressable>
                </View>
            )}

            {/* Content */}
            {state.isLoading ? (
                <View style={styles.centerState}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={[styles.stateText, { fontSize: s(13) }]}>{t('directoryTree.loadingFile')}</Text>
                </View>
            ) : state.error ? (
                <View style={styles.centerState}>
                    <Octicons name="alert" size={s(24)} color={theme.colors.textSecondary} />
                    <Text style={[styles.stateText, { fontSize: s(13) }]}>{state.error}</Text>
                </View>
            ) : state.isBinary ? (
                <View style={styles.centerState}>
                    <Octicons name="file-binary" size={s(24)} color={theme.colors.textSecondary} />
                    <Text style={[styles.stateTitle, { fontSize: s(14) }]}>{t('directoryTree.binaryFile')}</Text>
                    <Text style={[styles.stateText, { fontSize: s(13) }]}>{t('directoryTree.binaryFileHint')}</Text>
                </View>
            ) : state.skippedLargeFile ? (
                <View style={styles.centerState}>
                    <Octicons name="file" size={s(24)} color={theme.colors.textSecondary} />
                    <Text style={[styles.stateTitle, { fontSize: s(14) }]}>{t('files.largeFileSkipped')}</Text>
                    <Text style={[styles.stateText, { fontSize: s(13) }]}>{t('files.largeFileSkippedHint')}</Text>
                </View>
            ) : state.previewKind === 'image' && state.imageUri ? (
                <View style={styles.imagePreviewContainer}>
                    <Image
                        source={{ uri: state.imageUri }}
                        contentFit="contain"
                        style={styles.imagePreview}
                    />
                </View>
            ) : state.previewKind === 'svg' && state.content ? (
                <View style={styles.imagePreviewContainer}>
                    <SvgXml
                        xml={state.content}
                        width="100%"
                        height="100%"
                    />
                </View>
            ) : canPreviewMarkdown && markdownMode === 'preview' ? (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: s(14) }}>
                    <MarkdownView markdown={markdownPreviewContent} showOptions={false} />
                </ScrollView>
            ) : (
                <View style={styles.codeContainer}>
                    <SimpleSyntaxHighlighter
                        code={state.content}
                        language={language ?? null}
                        selectable={true}
                        showLineNumbers={true}
                        scaleMultiplier={scale}
                        surface={theme.dark ? 'terminal' : 'default'}
                        accessibilityLabel={`${t('files.preview')}: ${fileName}`}
                    />
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    fileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        gap: 8,
    },
    filePath: {
        flex: 1,
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.mono(),
    },
    closeBtn: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        gap: 8,
    },
    stateTitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    stateText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
    },
    codeContainer: {
        flex: 1,
        backgroundColor: theme.colors.codeSurface.background,
    },
    imagePreviewContainer: {
        flex: 1,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    imagePreview: {
        width: '100%',
        height: '100%',
    },
    truncatedBanner: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: theme.colors.surfaceHigh,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    truncatedText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
    },
    markdownToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    markdownModeButton: {
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));
