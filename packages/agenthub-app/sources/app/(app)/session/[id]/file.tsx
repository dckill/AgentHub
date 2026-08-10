import * as React from 'react';
import { View, ActivityIndicator, Platform, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgXml } from 'react-native-svg';
import { useLocalSearchParams } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';
import { Text } from '@/components/StyledText';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { HorizontalScrollView } from '@/components/HorizontalScrollView';
import { Typography } from '@/constants/Typography';
import { sessionExec } from '@/sync/ops';
import { storage, useSessionFileCache, useSetting } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { Modal } from '@/modal';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { FileIcon } from '@/components/FileIcon';
import { decodeSessionFileRoutePath, resolveSessionFilePath } from '@/utils/sessionFileLinks';
import { useFileScale } from '@/hooks/useScale';
import { useGitStatusFiles } from '@/hooks/useGitStatusFiles';
import { useGitActions } from '@/hooks/useGitActions';
import type { GitFileStatus } from '@/sync/gitStatusFiles';
import { buildGitFileDiffExec, type GitFileDiffSource } from '@/utils/gitDiffCommand';
import { classifyFilePreview } from '@/utils/filePreviewPolicy';
import type { FilePreviewClassification } from '@/utils/filePreviewPolicy';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { GlassSurface } from '@/components/glass';
import { getGitFileStatusPresentation } from '@/utils/gitPresentation';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { detectLanguageFromPath, isMarkdownFilePath } from '@/utils/fileLanguage';
import { formatFileSize as formatSize, loadFilePreviewContent } from '@/utils/filePreviewLoader';
import { getMarkdownFilePreviewContent, loadMarkdownImageMapForFile } from '@/utils/markdownFilePreview';
import { resolveFileDisplayModeAfterContentUpdate, type FileDisplayMode } from '@/utils/fileDisplayMode';
import { getFilePrefetchVersion } from '@/hooks/filePrefetchPolicy';
import { ScreenReaderHeading } from '@/components/ScreenReaderHeading';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';

interface FileContent {
    content: string;
    encoding: 'utf8' | 'base64';
    isBinary: boolean;
    previewKind: FilePreviewClassification['kind'];
    imageUri?: string;
}

function formatLineChanges(file: GitFileStatus): string {
    const parts: string[] = [];
    if (file.linesAdded > 0) parts.push(`+${file.linesAdded}`);
    if (file.linesRemoved > 0) parts.push(`-${file.linesRemoved}`);
    return parts.join(' ');
}

export default React.memo(function FileScreen() {
    const { theme } = useUnistyles();
    const { scale, s } = useFileScale();
    const wrapLinesInDiffs = useSetting('wrapLinesInDiffs');
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const searchParams = useLocalSearchParams();
    const encodedPath = searchParams.path as string;
    const lineParam = searchParams.line as string | undefined;
    const columnParam = searchParams.column as string | undefined;
    const diffSourceParam = searchParams.source as GitFileDiffSource;
    const statusParam = searchParams.status as GitFileStatus['status'] | undefined;
    const requestedLine = lineParam ? Number.parseInt(lineParam, 10) : null;
    const requestedColumn = columnParam ? Number.parseInt(columnParam, 10) : null;
    const session = storage.getState().sessions[sessionId!];
    const sessionPath = session?.metadata?.path ?? null;
    let rawPath = '';

    rawPath = encodedPath ? decodeSessionFileRoutePath(encodedPath) : '';
    const resolvedPath = resolveSessionFilePath(rawPath, sessionPath);
    const filePath = resolvedPath?.absolutePath ?? rawPath;
    const gitDiffPath = resolvedPath?.withinSessionRoot ? resolvedPath.relativePath : null;
    const fileName = filePath.split('/').pop() || filePath;
    const initialPreviewKind = classifyFilePreview(filePath).kind;
    const gitStatusFilesQuery = useGitStatusFiles(sessionId!);
    const gitActions = useGitActions(sessionId!);
    const currentGitFile = React.useMemo(() => {
        const statusFiles = gitStatusFilesQuery.data;
        if (!statusFiles || !gitDiffPath) return null;
        const pool = diffSourceParam === 'staged'
            ? statusFiles.stagedFiles
            : diffSourceParam === 'unstaged'
                ? statusFiles.unstagedFiles
                : [...statusFiles.stagedFiles, ...statusFiles.unstagedFiles];
        return pool.find((file) => file.fullPath === gitDiffPath || file.fullPath === rawPath) ?? null;
    }, [diffSourceParam, gitDiffPath, gitStatusFilesQuery.data, rawPath]);

    // Read from Zustand cache for instant rendering on revisit
    const fileCacheVersion = currentGitFile ? getFilePrefetchVersion(currentGitFile) : undefined;
    const cached = useSessionFileCache(sessionId!, filePath, fileCacheVersion);
    const hasCachedPreview = !!cached;
    const cachedRef = React.useRef(cached);
    cachedRef.current = cached;

    React.useEffect(() => {
        if (hasCachedPreview && sessionId) {
            storage.getState().touchFileCache(sessionId, filePath);
        }
    }, [filePath, hasCachedPreview, sessionId]);

    const [fileContent, setFileContent] = React.useState<FileContent | null>(() => {
        if (!cached) return null;
        return {
            content: cached.content ?? '',
            encoding: 'utf8',
            isBinary: cached.isBinary,
            previewKind: cached.isBinary ? 'binary' : initialPreviewKind,
        };
    });
    const [diffContent, setDiffContent] = React.useState<string | null>(() => cached?.diff ?? null);
    const [displayMode, setDisplayMode] = React.useState<FileDisplayMode>('diff');
    const userSelectedDisplayModeRef = React.useRef(false);
    const [markdownMode, setMarkdownMode] = React.useState<'source' | 'preview'>('source');
    const [isLoading, setIsLoading] = React.useState(!cached);
    const [error, setError] = React.useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = React.useState(0);
    const [truncated, setTruncated] = React.useState(() => cached?.truncated ?? false);
    const [totalSize, setTotalSize] = React.useState(() => cached?.totalSize);
    const [skippedLargeFile, setSkippedLargeFile] = React.useState(false);
    const [markdownImageMap, setMarkdownImageMap] = React.useState<Record<string, string>>({});
    const previewScrollRef = React.useRef<React.ElementRef<typeof ScrollView>>(null);
    const sourceScrollRef = React.useRef<React.ElementRef<typeof ScrollView>>(null);

    // Load file content (fetches in background even if cache exists)
    React.useEffect(() => {
        let isCancelled = false;
        const generation = sync.getAccountGeneration();
        const isCurrent = () => !isCancelled && generation !== null && sync.getAccountGeneration() === generation;
        const cachedAtRequestStart = cachedRef.current;

        const loadFile = async () => {
            let fetchedDiff: string | null = null;
            try {
                if (!isCurrent()) return;
                // Only show loading spinner if no cache
                if (!cachedAtRequestStart) {
                    setIsLoading(true);
                }
                setError(null);
                setSkippedLargeFile(false);

                // Fetch git diff for the file (if in git repo)
                if (sessionPath && sessionId && gitDiffPath && gitDiffPath !== '.') {
                    try {
                        const diffResponse = await sessionExec(sessionId, {
                            ...buildGitFileDiffExec(gitDiffPath, diffSourceParam),
                            cwd: sessionPath,
                            timeout: 5000
                        });

                        if (isCurrent() && diffResponse.success && diffResponse.stdout?.trim()) {
                            fetchedDiff = diffResponse.stdout;
                            setDiffContent(fetchedDiff);
                        }
                    } catch {
                        // Diff is optional; file preview should still render without it.
                    }
                }

                if (statusParam === 'deleted' && fetchedDiff) {
                    if (isCurrent()) {
                        setFileContent(null);
                    }
                    return;
                }

                const loaded = await loadFilePreviewContent({
                    source: { kind: 'session', id: sessionId, cwd: sessionPath },
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
                if (isCurrent()) {
                    setTruncated(loaded.truncated);
                    setTotalSize(loaded.totalSize);

                    if (loaded.skippedLargeFile) {
                        setSkippedLargeFile(true);
                        setFileContent(null);
                        return;
                    }

                    setFileContent({
                        content: loaded.content,
                        encoding: loaded.encoding,
                        isBinary: loaded.isBinary,
                        previewKind: loaded.previewKind,
                        imageUri: loaded.imageUri,
                    });

                    if (loaded.previewKind !== 'image') {
                        storage.getState().applyFileCache(
                            sessionId!,
                            filePath,
                            loaded.content,
                            fetchedDiff,
                            loaded.isBinary,
                            loaded.totalSize,
                            loaded.truncated,
                            fileCacheVersion,
                        );
                    }
                }
            } catch {
                if (isCurrent()) {
                    if (fetchedDiff) {
                        setFileContent(null);
                    } else if (!cachedAtRequestStart) {
                        setError(t('files.fileLoadFailed'));
                    }
                }
            } finally {
                if (isCurrent()) {
                    setIsLoading(false);
                }
            }
        };

        loadFile();

        return () => {
            isCancelled = true;
        };
    }, [diffSourceParam, fileCacheVersion, fileName, filePath, gitDiffPath, loadAttempt, sessionId, sessionPath, statusParam]);

    const handleRetry = React.useCallback(() => {
        setLoadAttempt((attempt) => attempt + 1);
    }, []);

    React.useEffect(() => {
        userSelectedDisplayModeRef.current = false;
    }, [diffSourceParam, filePath, requestedLine]);

    const selectDisplayMode = React.useCallback((mode: FileDisplayMode) => {
        userSelectedDisplayModeRef.current = true;
        setDisplayMode(mode);
    }, []);

    // Set default display mode based on diff availability without overriding a manual tab choice.
    React.useEffect(() => {
        setDisplayMode((currentMode) => resolveFileDisplayModeAfterContentUpdate(currentMode, {
            hasDiffContent: !!diffContent,
            hasFileContent: !!fileContent,
            requestedLine,
            userSelectedDisplayMode: userSelectedDisplayModeRef.current,
        }));
    }, [diffContent, fileContent, requestedLine]);

    const language = detectLanguageFromPath(filePath);
    const isMarkdownFile = isMarkdownFilePath(filePath);
    const canPreviewMarkdown = isMarkdownFile && !!fileContent?.content && !fileContent.isBinary;
    const visiblePath = requestedLine !== null && requestedLine > 0
        ? `${filePath}:${requestedLine}${requestedColumn !== null && requestedColumn > 0 ? `:${requestedColumn}` : ''}`
        : filePath;
    const statusPresentation = currentGitFile
        ? getGitFileStatusPresentation(currentGitFile.status)
        : statusParam
            ? getGitFileStatusPresentation(statusParam)
            : null;
    const lineChanges = currentGitFile ? formatLineChanges(currentGitFile) : '';
    const sourceLabel = currentGitFile ? (currentGitFile.isStaged ? t('files.stagedTab') : t('files.unstagedTab')) : null;
    const markdownPreviewContent = React.useMemo(() => {
        if (!canPreviewMarkdown || !fileContent?.content) return fileContent?.content ?? '';
        return getMarkdownFilePreviewContent(fileContent.content, markdownImageMap);
    }, [canPreviewMarkdown, fileContent?.content, markdownImageMap]);

    React.useEffect(() => {
        if (!canPreviewMarkdown || !fileContent?.content || !sessionId) {
            setMarkdownImageMap({});
            return;
        }

        let cancelled = false;
        setMarkdownImageMap({});
        loadMarkdownImageMapForFile({
            markdown: fileContent.content,
            markdownFilePath: filePath,
            source: { kind: 'session', id: sessionId, cwd: sessionPath },
        }).then((map) => {
            if (!cancelled) setMarkdownImageMap(map);
        }).catch(() => {
            if (!cancelled) setMarkdownImageMap({});
        });

        return () => {
            cancelled = true;
        };
    }, [canPreviewMarkdown, fileContent?.content, filePath, sessionId, sessionPath]);

    React.useEffect(() => {
        if (Platform.OS !== 'web') return;

        const regions = [
            { ref: previewScrollRef, label: t('files.preview') },
            { ref: sourceScrollRef, label: t('files.file') },
        ];
        for (const region of regions) {
            const scrollNode = region.ref.current?.getScrollableNode?.() as HTMLElement | undefined;
            if (!scrollNode?.setAttribute) continue;
            scrollNode.setAttribute('role', 'region');
            scrollNode.setAttribute('aria-label', region.label);
            scrollNode.setAttribute('tabindex', '0');
        }
    }, [displayMode, fileContent?.content, markdownMode]);

    if (isLoading) {
        return (
            <FileStateScreen
                title={t('files.loadingFile', { fileName })}
                icon="file"
                loading
            />
        );
    }

    if (error) {
        return (
            <FileStateScreen
                title={t('common.error')}
                description={error}
                icon="alert"
                destructive
                onRetry={handleRetry}
            />
        );
    }

    if (fileContent?.isBinary) {
        return (
            <FileStateScreen
                title={t('files.binaryFile')}
                description={t('files.cannotDisplayBinary')}
                meta={fileName}
                icon="file-binary"
            />
        );
    }

    if (skippedLargeFile) {
        return (
            <FileStateScreen
                title={t('files.largeFileSkipped')}
                description={t('files.largeFileSkippedHint')}
                meta={`${fileName}${totalSize ? ` · ${formatSize(totalSize)}` : ''}`}
                icon="file"
            />
        );
    }

    const sourceCode = fileContent?.content ? (
        <SimpleSyntaxHighlighter
            code={fileContent.content}
            language={language}
            selectable={true}
            showLineNumbers={true}
            scaleMultiplier={scale}
            surface={theme.dark ? 'terminal' : 'default'}
            virtualized={wrapLinesInDiffs}
            wrapLines={wrapLinesInDiffs}
            accessibilityLabel={t('files.source')}
        />
    ) : null;

    const content = displayMode === 'diff' && diffContent ? (
        <View style={styles.diffContent}>
            <ToolDiffView
                patch={diffContent}
                fileName={fileName}
                style={styles.diffViewer}
                showLineNumbers
                scrollable
                scaleMultiplier={scale}
            />
        </View>
    ) : displayMode === 'file' && fileContent?.previewKind === 'image' && fileContent.imageUri ? (
        <View style={styles.imagePreviewContainer}>
            <Image
                source={{ uri: fileContent.imageUri }}
                contentFit="contain"
                style={styles.imagePreview}
            />
        </View>
    ) : displayMode === 'file' && fileContent?.previewKind === 'svg' && fileContent.content ? (
        <View style={styles.imagePreviewContainer}>
            <SvgXml
                xml={fileContent.content}
                width="100%"
                height="100%"
            />
        </View>
    ) : displayMode === 'file' && canPreviewMarkdown && markdownMode === 'preview' ? (
        <ScrollView
            ref={previewScrollRef}
            style={styles.previewScroll}
            contentContainerStyle={styles.previewContent}
            accessibilityLabel={t('files.preview')}
            role="region"
            tabIndex={Platform.OS === 'web' ? 0 : undefined}
        >
            <MarkdownView markdown={markdownPreviewContent} showOptions={false} />
        </ScrollView>
    ) : displayMode === 'file' && sourceCode ? (
        wrapLinesInDiffs ? sourceCode : (
            <ScrollView
                ref={sourceScrollRef}
                style={styles.sourceVerticalScroll}
                contentContainerStyle={styles.sourceVerticalContent}
                accessibilityLabel={t('files.file')}
                role="region"
                tabIndex={Platform.OS === 'web' ? 0 : undefined}
            >
                <HorizontalScrollView
                    contentContainerStyle={styles.sourceHorizontalContent}
                    accessibilityLabel={t('files.source')}
                    role="region"
                    tabIndex={Platform.OS === 'web' ? 0 : undefined}
                >
                    {sourceCode}
                </HorizontalScrollView>
            </ScrollView>
        )
    ) : displayMode === 'file' && fileContent && !fileContent.content ? (
        <EmptyFilePanel label={t('files.fileEmpty')} />
    ) : !diffContent && !fileContent?.content ? (
        <EmptyFilePanel label={t('files.noChanges')} />
    ) : null;

    return (
        <View role="main" style={styles.page}>
            <ScreenReaderHeading title={fileName} />
            <FileCanvasBackground />
            <View style={styles.container}>
                <GlassSurface tone="floating" style={styles.headerCard}>
                    <View style={styles.fileHeroRow}>
                        <View style={styles.fileIconFrame}>
                            <FileIcon fileName={fileName} size={s(34)} />
                        </View>
                        <View style={styles.fileTitleBlock}>
                            <Text style={[styles.fileName, { fontSize: s(18), lineHeight: s(24) }]} numberOfLines={1}>
                                {fileName}
                            </Text>
                            <Text style={[styles.filePath, { fontSize: s(12), lineHeight: s(17) }]} numberOfLines={2}>
                                {visiblePath}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.metaRow}>
                        {statusPresentation && (
                            <FileStatusBadge
                                label={t(statusPresentation.labelKey)}
                                icon={statusPresentation.icon as React.ComponentProps<typeof Octicons>['name']}
                                tone={statusPresentation.tone}
                            />
                        )}
                        {sourceLabel && <MetaPill label={sourceLabel} />}
                        {!!lineChanges && <MetaPill label={lineChanges} mono />}
                        {totalSize != null && <MetaPill label={formatSize(totalSize)} />}
                    </View>

                    {currentGitFile && (
                        <View style={styles.actionRow}>
                            <GitFileActionButton
                                label={currentGitFile.isStaged ? t('gitActions.unstage') : t('gitActions.stage')}
                                icon={currentGitFile.isStaged ? 'diff-removed' : 'diff-added'}
                                disabled={gitActions.loading}
                                onPress={() => currentGitFile.isStaged ? gitActions.unstageFile(currentGitFile) : gitActions.stageFile(currentGitFile)}
                            />
                            <GitFileActionButton
                                label={t('gitActions.discard')}
                                icon="trash"
                                destructive
                                disabled={gitActions.loading}
                                onPress={() => gitActions.discardFile(currentGitFile)}
                            />
                        </View>
                    )}

                    {diffContent && (
                        <View accessibilityRole="tablist" style={styles.segmentedRow}>
                            <SegmentButton
                                label={t('files.diff')}
                                selected={displayMode === 'diff'}
                                onPress={() => selectDisplayMode('diff')}
                            />
                            <SegmentButton
                                label={t('files.file')}
                                selected={displayMode === 'file'}
                                onPress={() => selectDisplayMode('file')}
                            />
                        </View>
                    )}

                    {displayMode === 'file' && canPreviewMarkdown && (
                        <View accessibilityRole="tablist" style={styles.segmentedRowCompact}>
                            <SegmentButton
                                label={t('files.source')}
                                selected={markdownMode === 'source'}
                                onPress={() => setMarkdownMode('source')}
                                compact
                            />
                            <SegmentButton
                                label={t('files.preview')}
                                selected={markdownMode === 'preview'}
                                onPress={() => setMarkdownMode('preview')}
                                compact
                            />
                        </View>
                    )}
                </GlassSurface>

                {truncated && totalSize != null && (
                    <GlassSurface tone="accent" sheen="subtle" edgeIntensity="subtle" style={styles.truncatedBanner}>
                        <Text style={[styles.truncatedText, { fontSize: s(12), lineHeight: s(16) }]}>
                            {t('files.fileTruncated', { loaded: formatSize(fileContent?.content?.length ?? 0), total: formatSize(totalSize) })}
                        </Text>
                    </GlassSurface>
                )}

                <View style={styles.contentCard}>
                    <View style={styles.readerHeader}>
                        <View style={styles.readerTitleBlock}>
                            <Text style={[styles.readerEyebrow, { fontSize: s(11), lineHeight: s(14) }]}>
                                {displayMode === 'diff' ? t('files.diff') : t('files.file')}
                            </Text>
                            <Text style={[styles.readerTitle, { fontSize: s(14), lineHeight: s(18) }]} numberOfLines={1}>
                                {displayMode === 'diff' && diffContent ? `${fileName} ${lineChanges || ''}`.trim() : language || fileName}
                            </Text>
                        </View>
                        {displayMode === 'file' && totalSize != null && (
                            <Text style={[styles.readerMeta, { fontSize: s(11), lineHeight: s(14) }]} numberOfLines={1}>
                                {formatSize(totalSize)}
                            </Text>
                        )}
                    </View>
                    <View style={styles.readerBody}>
                        {content}
                    </View>
                </View>
            </View>
        </View>
    );
});

function FileCanvasBackground() {
    const { theme } = useUnistyles();

    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <LinearGradient
                colors={theme.dark
                    ? ['#070A0B', '#0B1012', '#070A0B']
                    : ['#FFFFFF', '#F6F9FA', '#EEF4F6']}
                start={{ x: 0.05, y: 0 }}
                end={{ x: 0.95, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <LinearGradient
                colors={theme.dark
                    ? ['rgba(148, 163, 184, 0.055)', 'rgba(148, 163, 184, 0.020)', 'rgba(148, 163, 184, 0)']
                    : ['rgba(255, 255, 255, 0.72)', 'rgba(148, 163, 184, 0.050)', 'rgba(148, 163, 184, 0)']}
                locations={[0, 0.48, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.backdropSheen}
            />
            <View style={[styles.backdropLine, { left: '22%', backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(28, 44, 52, 0.045)' }]} />
            <View style={[styles.backdropLine, { left: '64%', opacity: 0.62, backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(28, 44, 52, 0.035)' }]} />
            <View style={[styles.backdropHorizontalLine, { top: '34%', backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(28, 44, 52, 0.030)' }]} />
        </View>
    );
}

const FileStateScreen = React.memo(function FileStateScreen({
    title,
    description,
    meta,
    icon,
    loading,
    destructive,
    onRetry,
}: {
    title: string;
    description?: string;
    meta?: string;
    icon: React.ComponentProps<typeof Octicons>['name'];
    loading?: boolean;
    destructive?: boolean;
    onRetry?: () => void;
}) {
    const { theme } = useUnistyles();
    const { s } = useFileScale();
    const iconColor = destructive ? theme.colors.status.error : theme.colors.accent;

    return (
        <View role="main" style={styles.page}>
            <ScreenReaderHeading title={title} />
            <FileCanvasBackground />
            <View style={styles.stateWrap}>
                <GlassSurface
                    role={destructive ? 'alert' : 'status'}
                    accessibilityLiveRegion={loading ? 'polite' : undefined}
                    tone="floating"
                    style={styles.stateCard}
                >
                    <View style={[styles.stateIcon, { backgroundColor: destructive ? theme.colors.box.error.background : theme.colors.accentSoft }]}>
                        {loading ? (
                            <ActivityIndicator size="small" color={iconColor} />
                        ) : (
                            <Octicons name={icon} size={s(22)} color={iconColor} />
                        )}
                    </View>
                    <Text style={[styles.stateTitle, { fontSize: s(18), lineHeight: s(24), color: destructive ? theme.colors.textDestructive : theme.colors.text }]}>
                        {title}
                    </Text>
                    {!!description && (
                        <Text style={[styles.stateDescription, { fontSize: s(14), lineHeight: s(20) }]}>
                            {description}
                        </Text>
                    )}
                    {!!meta && (
                        <Text style={[styles.stateMeta, { fontSize: s(12), lineHeight: s(17) }]} numberOfLines={2}>
                            {meta}
                        </Text>
                    )}
                    {onRetry ? (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('common.retry')}
                            onPress={onRetry}
                            style={styles.stateRetryButton}
                        >
                            <Text style={styles.stateRetryText}>{t('common.retry')}</Text>
                        </Pressable>
                    ) : null}
                </GlassSurface>
            </View>
        </View>
    );
});

const EmptyFilePanel = React.memo(function EmptyFilePanel({ label }: { label: string }) {
    const { theme } = useUnistyles();
    const { s } = useFileScale();

    return (
        <View style={styles.emptyPanel}>
            <View style={styles.emptyIcon}>
                <Octicons name="file" size={s(20)} color={theme.colors.textMuted} />
            </View>
            <Text style={[styles.emptyText, { fontSize: s(15), lineHeight: s(21) }]}>
                {label}
            </Text>
        </View>
    );
});

const MetaPill = React.memo(function MetaPill({ label, mono }: { label: string; mono?: boolean }) {
    const { theme } = useUnistyles();
    const { s } = useFileScale();

    return (
        <View style={styles.metaPill}>
            <Text
                style={[
                    styles.metaPillText,
                    mono ? Typography.mono() : Typography.default('semiBold'),
                    { fontSize: s(11), lineHeight: s(14), color: theme.colors.textSecondary },
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
});

const FileStatusBadge = React.memo(function FileStatusBadge({
    label,
    icon,
    tone,
}: {
    label: string;
    icon: React.ComponentProps<typeof Octicons>['name'];
    tone: ReturnType<typeof getGitFileStatusPresentation>['tone'];
}) {
    const { theme } = useUnistyles();
    const { s } = useFileScale();
    const colors = getStatusToneColors(theme, tone);

    return (
        <View style={[styles.statusBadge, { backgroundColor: colors.backgroundColor, borderColor: colors.borderColor }]}>
            <Octicons name={icon} size={s(13)} color={colors.textColor} />
            <Text style={[styles.statusBadgeText, { fontSize: s(11), lineHeight: s(14), color: colors.textColor }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
});

function getStatusToneColors(theme: ReturnType<typeof useUnistyles>['theme'], tone: ReturnType<typeof getGitFileStatusPresentation>['tone']) {
    switch (tone) {
        case 'added':
            return {
                textColor: theme.colors.gitAddedText,
                backgroundColor: theme.dark ? 'rgba(74, 222, 128, 0.13)' : 'rgba(22, 163, 74, 0.10)',
                borderColor: theme.dark ? 'rgba(74, 222, 128, 0.25)' : 'rgba(22, 163, 74, 0.18)',
            };
        case 'deleted':
            return {
                textColor: theme.colors.gitRemovedText,
                backgroundColor: theme.dark ? 'rgba(248, 113, 113, 0.13)' : 'rgba(220, 38, 38, 0.09)',
                borderColor: theme.dark ? 'rgba(248, 113, 113, 0.25)' : 'rgba(220, 38, 38, 0.16)',
            };
        case 'renamed':
            return {
                textColor: theme.colors.textLink,
                backgroundColor: theme.dark ? 'rgba(95, 168, 255, 0.13)' : 'rgba(39, 109, 212, 0.09)',
                borderColor: theme.dark ? 'rgba(95, 168, 255, 0.25)' : 'rgba(39, 109, 212, 0.16)',
            };
        case 'untracked':
            return {
                textColor: theme.colors.textSecondary,
                backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(28, 44, 52, 0.055)',
                borderColor: theme.dark ? 'rgba(255, 255, 255, 0.090)' : 'rgba(28, 44, 52, 0.080)',
            };
        case 'modified':
        default:
            return {
                textColor: theme.colors.accent,
                backgroundColor: theme.dark ? 'rgba(255, 177, 66, 0.13)' : 'rgba(255, 177, 66, 0.14)',
                borderColor: theme.colors.glass.edgeWarm,
            };
    }
}

const SegmentButton = React.memo(function SegmentButton({
    label,
    selected,
    onPress,
    compact,
}: {
    label: string;
    selected: boolean;
    onPress: () => void;
    compact?: boolean;
}) {
    const { theme } = useUnistyles();
    const { s } = useFileScale();

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            aria-selected={selected}
            {...getSpaceKeyActivationProps(onPress)}
            style={({ pressed }) => [
                styles.segmentButton,
                compact && styles.segmentButtonCompact,
                {
                    paddingHorizontal: compact ? s(12) : s(14),
                    backgroundColor: selected ? theme.colors.accent : 'transparent',
                    borderColor: selected ? theme.colors.glass.edgeWarm : 'transparent',
                    opacity: pressed ? 0.76 : 1,
                },
            ]}
        >
            <Text
                style={[
                    styles.segmentText,
                    {
                        fontSize: compact ? s(12) : s(13),
                        lineHeight: compact ? s(15) : s(17),
                        color: selected ? theme.colors.button.primary.tint : theme.colors.textSecondary,
                    },
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </Pressable>
    );
});

const GitFileActionButton = React.memo(function GitFileActionButton({
    label,
    icon,
    destructive,
    disabled,
    onPress,
}: {
    label: string;
    icon: React.ComponentProps<typeof Octicons>['name'];
    destructive?: boolean;
    disabled?: boolean;
    onPress: () => void;
}) {
    const { theme } = useUnistyles();
    const { s } = useFileScale();
    const color = destructive ? theme.colors.textDestructive : theme.colors.accent;

    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled, busy: disabled }}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(6),
                minHeight: 44,
                paddingHorizontal: s(13),
                paddingVertical: s(8),
                borderRadius: s(11),
                backgroundColor: destructive
                    ? theme.colors.box.error.background
                    : theme.dark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.58)',
                borderWidth: 1,
                borderColor: destructive ? theme.colors.box.error.border : theme.colors.glass.border,
                opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
            })}
        >
            <Octicons name={icon} size={s(15)} color={color} />
            <Text style={{
                fontSize: s(13),
                color: destructive ? color : theme.colors.text,
                fontWeight: '600',
                ...Typography.default('semiBold'),
            }}>
                {label}
            </Text>
        </Pressable>
    );
});

const styles = StyleSheet.create((theme) => ({
    page: {
        flex: 1,
        backgroundColor: theme.colors.canvas,
        overflow: 'hidden',
    },
    container: {
        flex: 1,
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        width: '100%',
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 12,
        gap: 10,
    },
    backdropSheen: {
        position: 'absolute',
        top: -150,
        left: -120,
        right: -80,
        height: 560,
    },
    backdropLine: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: StyleSheet.hairlineWidth,
    },
    backdropHorizontalLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: StyleSheet.hairlineWidth,
    },
    headerCard: {
        padding: 14,
        borderRadius: 18,
        gap: 12,
    },
    fileHeroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    fileIconFrame: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.64)',
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    fileTitleBlock: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    fileName: {
        ...Typography.default('semiBold'),
        color: theme.colors.text,
    },
    filePath: {
        ...Typography.mono(),
        color: theme.colors.textSecondary,
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 7,
    },
    metaPill: {
        minHeight: 24,
        justifyContent: 'center',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.58)',
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.070)' : 'rgba(28, 44, 52, 0.060)',
    },
    metaPillText: {
        includeFontPadding: false,
    },
    statusBadge: {
        minHeight: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderWidth: 1,
    },
    statusBadgeText: {
        ...Typography.default('semiBold'),
        includeFontPadding: false,
    },
    actionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
    },
    segmentedRow: {
        flexDirection: 'row',
        gap: 6,
        padding: 4,
        borderRadius: 13,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(238, 246, 248, 0.74)',
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.82)',
    },
    segmentedRowCompact: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        gap: 5,
        padding: 3,
        borderRadius: 12,
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.040)' : 'rgba(238, 246, 248, 0.66)',
        borderWidth: 1,
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.050)' : 'rgba(255, 255, 255, 0.78)',
    },
    segmentButton: {
        minHeight: 44,
        minWidth: 44,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
    },
    segmentButtonCompact: {
        flex: 0,
        borderRadius: 9,
    },
    segmentText: {
        ...Typography.default('semiBold'),
        includeFontPadding: false,
    },
    truncatedBanner: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14,
    },
    truncatedText: {
        ...Typography.default('semiBold'),
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    contentCard: {
        flex: 1,
        minHeight: 0,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: theme.colors.codeSurface.background,
        borderWidth: 1,
        borderColor: theme.colors.codeSurface.border,
        shadowColor: theme.colors.shadow.color,
        shadowOpacity: theme.dark ? 0.2 : 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
    },
    readerHeader: {
        minHeight: 46,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: theme.colors.codeSurface.headerBackground,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.codeSurface.border,
    },
    readerTitleBlock: {
        flex: 1,
        minWidth: 0,
        gap: 1,
    },
    readerEyebrow: {
        ...Typography.default('semiBold'),
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
    },
    readerTitle: {
        ...Typography.mono(),
        color: theme.colors.text,
    },
    readerMeta: {
        ...Typography.mono(),
        color: theme.colors.textSecondary,
    },
    readerBody: {
        flex: 1,
        minHeight: 0,
        backgroundColor: theme.colors.codeSurface.background,
    },
    diffContent: {
        flex: 1,
        minHeight: 0,
        padding: 8,
    },
    diffViewer: {
        flex: 1,
    },
    previewScroll: {
        flex: 1,
    },
    previewContent: {
        padding: 16,
    },
    sourceVerticalScroll: {
        flex: 1,
    },
    sourceVerticalContent: {
        minHeight: '100%',
    },
    sourceHorizontalContent: {
        minWidth: '100%',
    },
    imagePreviewContainer: {
        flex: 1,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    imagePreview: {
        width: '100%',
        height: '100%',
    },
    emptyPanel: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 10,
    },
    emptyIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(28, 44, 52, 0.045)',
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    emptyText: {
        ...Typography.default(),
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    stateWrap: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    stateCard: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        gap: 10,
    },
    stateIcon: {
        width: 52,
        height: 52,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.glass.border,
    },
    stateTitle: {
        ...Typography.default('semiBold'),
        textAlign: 'center',
    },
    stateDescription: {
        ...Typography.default(),
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    stateMeta: {
        ...Typography.mono(),
        color: theme.colors.textMuted,
        textAlign: 'center',
    },
    stateRetryButton: {
        minWidth: 96,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        borderRadius: 12,
        backgroundColor: theme.colors.button.primary.background,
    },
    stateRetryText: {
        color: theme.colors.button.primary.tint,
        ...Typography.default('semiBold'),
    },
}));
