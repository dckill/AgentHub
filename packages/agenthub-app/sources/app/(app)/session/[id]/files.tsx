import * as React from 'react';
import { View, ActivityIndicator, FlatList, Platform, TextInput, Pressable, useWindowDimensions, type ViewToken } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '@/text';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Octicons from '@expo/vector-icons/Octicons';
import { Text } from '@/components/StyledText';
import { Item } from '@/components/Item';
import { ItemScaleProvider } from '@/components/ItemScaleContext';
import { Typography } from '@/constants/Typography';
import { GitFileStatus } from '@/sync/gitStatusFiles';
import { searchFiles, FileItem } from '@/sync/suggestionFile';
import { useSessionGitStatus, useSessionProjectGitStatus } from '@/sync/storage';
import { useGitStatusFiles } from '@/hooks/useGitStatusFiles';
import { useEnsureSessionLoaded } from '@/hooks/useEnsureSessionLoaded';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { FileIcon } from '@/components/FileIcon';
import { Shaker, ShakeInstance } from '@/components/Shaker';
import { usePrefetchFileContents } from '@/hooks/usePrefetchFileContents';
import { Modal } from '@/modal';
import { useGitActions } from '@/hooks/useGitActions';
import { useFileListScale } from '@/hooks/useScale';
import { encodeSessionFileRoutePath } from '@/utils/sessionFileLinks';
import {
    getGitFileStatusPresentation,
    getGitToolbarActions,
    GitToolbarActionDescriptor,
} from '@/utils/gitPresentation';
import { getAmberRaisedButtonVisuals } from '@/components/amberVisuals';
import {
    buildFileListRowLayouts,
    buildGitFileListRows,
    buildSearchFileListRows,
    type FileListRow,
} from '@/utils/gitFileListRows';
import { ScreenReaderHeading } from '@/components/ScreenReaderHeading';
import { getSpaceKeyActivationProps } from '@/components/keyboardActivation';

type GitFilterTab = 'all' | 'staged' | 'unstaged';
const FILE_PREFETCH_LOOKAHEAD = 4;

export default React.memo(function FilesScreen() {
    const router = useRouter();
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    useEnsureSessionLoaded(sessionId);

    const { data: gitStatusFiles, isLoading, error: gitStatusError, refresh: refreshGitStatus } = useGitStatusFiles(sessionId!);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<FileItem[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);
    const [searchError, setSearchError] = React.useState(false);
    const [searchAttempt, setSearchAttempt] = React.useState(0);
    const [activeTab, setActiveTab] = React.useState<GitFilterTab>('all');
    const projectGitStatus = useSessionProjectGitStatus(sessionId!);
    const sessionGitStatus = useSessionGitStatus(sessionId!);
    const gitStatus = projectGitStatus || sessionGitStatus;
    const { theme } = useUnistyles();
    const amberVisuals = getAmberRaisedButtonVisuals(theme);
    const { scale: fileListScale } = useFileListScale();
    const { width: windowWidth } = useWindowDimensions();
    const [prefetchRange, setPrefetchRange] = React.useState({ start: 0, end: 8, lookahead: FILE_PREFETCH_LOOKAHEAD });

    // Git actions hook
    const gitActions = useGitActions(sessionId!);

    // Refs for shaking deleted file items
    const shakerRefs = React.useRef(new Map<string, ShakeInstance>());

    // Handle search and file loading
    React.useEffect(() => {
        const loadFiles = async () => {
            if (!sessionId) return;

            try {
                setIsSearching(true);
                setSearchError(false);
                const results = await searchFiles(sessionId, searchQuery, { limit: 100 });
                setSearchResults(results);
            } catch (error) {
                console.error('Failed to search files:', error);
                setSearchResults([]);
                setSearchError(true);
            } finally {
                setIsSearching(false);
            }
        };

        // Load files when searching or when repo is clean
        const shouldShowAllFiles = searchQuery ||
            (gitStatusFiles?.totalStaged === 0 && gitStatusFiles?.totalUnstaged === 0);

        if (shouldShowAllFiles && !isLoading) {
            loadFiles();
        } else if (!searchQuery) {
            setSearchResults([]);
            setIsSearching(false);
        }
    }, [searchQuery, gitStatusFiles, sessionId, isLoading, searchAttempt]);

    const handleFilePress = React.useCallback((file: GitFileStatus | FileItem, source?: 'staged' | 'unstaged') => {
        const encodedPath = encodeSessionFileRoutePath(file.fullPath);
        if ('status' in file) {
            router.push(`/session/${sessionId}/file?path=${encodedPath}&source=${source ?? (file.isStaged ? 'staged' : 'unstaged')}&status=${file.status}`);
            return;
        }
        router.push(`/session/${sessionId}/file?path=${encodedPath}`);
    }, [router, sessionId]);

    const handleFileLongPress = React.useCallback((file: GitFileStatus) => {
        const buttons: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [];

        if (file.isStaged) {
            buttons.push({
                text: t('gitActions.unstage'),
                onPress: () => gitActions.unstageFile(file),
            });
        } else {
            buttons.push({
                text: t('gitActions.stage'),
                onPress: () => gitActions.stageFile(file),
            });
        }

        buttons.push({
            text: t('gitActions.discard'),
            style: 'destructive',
            onPress: () => gitActions.discardFile(file),
        });

        buttons.push({
            text: t('common.cancel'),
            style: 'cancel',
        });

        Modal.alert(file.fileName, undefined, buttons);
    }, [gitActions]);

    const renderFileIcon = (file: GitFileStatus) => {
        return <FileIcon fileName={file.fileName} size={48} />;
    };

    const getStatusColor = React.useCallback((tone: ReturnType<typeof getGitFileStatusPresentation>['tone']) => {
        switch (tone) {
            case 'modified':
                return '#FF9500';
            case 'added':
                return theme.colors.gitAddedText;
            case 'deleted':
                return theme.colors.gitRemovedText;
            case 'renamed':
                return theme.colors.textLink;
            case 'untracked':
                return theme.colors.textSecondary;
        }
    }, [theme]);

    const renderStatusIcon = (file: GitFileStatus) => {
        const presentation = getGitFileStatusPresentation(file.status);
        const color = getStatusColor(presentation.tone);

        return (
            <View style={[styles.statusBadge, { borderColor: color + '55', backgroundColor: color + '12' }]}>
                <Text style={[styles.statusText, { color }]} numberOfLines={1}>
                    {t(presentation.labelKey)}
                </Text>
                <Octicons name={presentation.icon as any} size={15} color={color} />
            </View>
        );
    };

    const renderLineChanges = (file: GitFileStatus) => {
        const parts = [];
        if (file.linesAdded > 0) {
            parts.push(`+${file.linesAdded}`);
        }
        if (file.linesRemoved > 0) {
            parts.push(`-${file.linesRemoved}`);
        }
        return parts.length > 0 ? parts.join(' ') : '';
    };

    const renderFileSubtitle = (file: GitFileStatus) => {
        const lineChanges = renderLineChanges(file);
        const pathPart = file.filePath || t('files.projectRoot');
        return lineChanges ? `${pathPart} • ${lineChanges}` : pathPart;
    };

    const renderFileIconForSearch = (file: FileItem) => {
        if (file.fileType === 'folder') {
            return <Octicons name="file-directory" size={29} color="#007AFF" />;
        }

        return <FileIcon fileName={file.fileName} size={44} />;
    };

    const renderGitFileItem = (file: GitFileStatus, index: number, prefix: string, isLast: boolean) => {
        const isDeleted = file.status === 'deleted';
        const item = (
            <Item
                title={file.fileName}
                subtitle={renderFileSubtitle(file)}
                icon={renderFileIcon(file)}
                rightElement={renderStatusIcon(file)}
                onPress={() => handleFilePress(file, prefix === 'staged' ? 'staged' : 'unstaged')}
                onLongPress={() => handleFileLongPress(file)}
                showDivider={!isLast}
            />
        );

        if (isDeleted) {
            return (
                <Shaker
                    ref={(ref) => {
                        if (ref) shakerRefs.current.set(file.fullPath, ref);
                        else shakerRefs.current.delete(file.fullPath);
                    }}
                >
                    {item}
                </Shaker>
            );
        }
        return item;
    };

    // Determine toolbar visibility
    const hasStaged = (gitStatusFiles?.totalStaged ?? 0) > 0;
    const hasUnstaged = (gitStatusFiles?.totalUnstaged ?? 0) > 0;
    const isDirty = gitStatus?.isDirty ?? false;
    const aheadCount = gitStatus?.aheadCount ?? 0;
    const behindCount = gitStatus?.behindCount ?? 0;
    const hasUpstream = !!gitStatus?.upstreamBranch;
    const stashCount = gitStatus?.stashCount ?? 0;
    const showToolbar = gitStatusFiles && (hasStaged || hasUnstaged || aheadCount > 0 || hasUpstream || stashCount > 0);
    const toolbarActions = React.useMemo(() => getGitToolbarActions({
        hasStaged,
        isDirty,
        hasUnstaged,
        stashCount,
        aheadCount,
        hasUpstream,
    }), [aheadCount, hasStaged, hasUnstaged, hasUpstream, isDirty, stashCount]);

    const handleToolbarAction = React.useCallback((action: GitToolbarActionDescriptor) => {
        switch (action.id) {
            case 'commit':
                gitActions.commit();
                break;
            case 'discard':
                gitActions.discardAll();
                break;
            case 'stash':
                gitActions.stashSave();
                break;
            case 'stash-pop':
                gitActions.stashPop();
                break;
            case 'push':
                gitActions.push();
                break;
            case 'pull':
                gitActions.pull();
                break;
        }
    }, [gitActions]);

    const visibleStagedFiles = React.useMemo(() => {
        if (!gitStatusFiles) return [];
        return activeTab === 'unstaged' ? [] : gitStatusFiles.stagedFiles;
    }, [activeTab, gitStatusFiles]);

    const visibleUnstagedFiles = React.useMemo(() => {
        if (!gitStatusFiles) return [];
        return activeTab === 'staged' ? [] : gitStatusFiles.unstagedFiles;
    }, [activeTab, gitStatusFiles]);
    const visibleGitFiles = React.useMemo(
        () => [...visibleStagedFiles, ...visibleUnstagedFiles],
        [visibleStagedFiles, visibleUnstagedFiles],
    );
    const prefetchableGitFiles = React.useMemo(
        () => searchQuery ? [] : visibleGitFiles,
        [searchQuery, visibleGitFiles],
    );
    usePrefetchFileContents(sessionId!, prefetchableGitFiles, prefetchRange);
    const showFilters = !isLoading && gitStatusFiles && !searchQuery && (gitStatusFiles.totalStaged > 0 || gitStatusFiles.totalUnstaged > 0);
    const useCompactListHeader = windowWidth < 430;
    const listHeaderTitle = React.useMemo(() => {
        if (!gitStatusFiles) return '';
        if (useCompactListHeader) {
            if (activeTab === 'staged') return `${gitStatusFiles.stagedFiles.length} ${t('files.stagedTab')}`;
            if (activeTab === 'unstaged') return `${gitStatusFiles.unstagedFiles.length} ${t('files.unstagedTab')}`;
            if (gitStatusFiles.totalStaged > 0 && gitStatusFiles.totalUnstaged > 0) {
                return t('files.summary', { staged: gitStatusFiles.totalStaged, unstaged: gitStatusFiles.totalUnstaged });
            }
            if (gitStatusFiles.totalStaged > 0) return `${gitStatusFiles.stagedFiles.length} ${t('files.stagedTab')}`;
            return `${gitStatusFiles.unstagedFiles.length} ${t('files.unstagedTab')}`;
        }
        if (activeTab === 'staged') return t('files.stagedChanges', { count: gitStatusFiles.stagedFiles.length });
        if (activeTab === 'unstaged') return t('files.unstagedChanges', { count: gitStatusFiles.unstagedFiles.length });
        if (gitStatusFiles.totalStaged > 0 && gitStatusFiles.totalUnstaged > 0) {
            return t('files.summary', { staged: gitStatusFiles.totalStaged, unstaged: gitStatusFiles.totalUnstaged });
        }
        if (gitStatusFiles.totalStaged > 0) return t('files.stagedChanges', { count: gitStatusFiles.stagedFiles.length });
        return t('files.unstagedChanges', { count: gitStatusFiles.unstagedFiles.length });
    }, [activeTab, gitStatusFiles, useCompactListHeader]);
    const showSectionHeaders = activeTab === 'all'
        && (gitStatusFiles?.totalStaged ?? 0) > 0
        && (gitStatusFiles?.totalUnstaged ?? 0) > 0;
    const showSearchContent = !!searchQuery
        || (gitStatusFiles?.totalStaged === 0 && gitStatusFiles?.totalUnstaged === 0);
    const listRows = React.useMemo<FileListRow[]>(() => {
        if (isLoading || !gitStatusFiles) return [];
        if (showSearchContent) {
            return isSearching ? [] : buildSearchFileListRows(searchResults, !!searchQuery);
        }
        return buildGitFileListRows(visibleStagedFiles, visibleUnstagedFiles, showSectionHeaders);
    }, [
        gitStatusFiles,
        isLoading,
        isSearching,
        searchQuery,
        searchResults,
        showSearchContent,
        showSectionHeaders,
        visibleStagedFiles,
        visibleUnstagedFiles,
    ]);
    const listRowLayouts = React.useMemo(
        () => buildFileListRowLayouts(listRows, fileListScale, StyleSheet.hairlineWidth),
        [fileListScale, listRows],
    );
    const getItemLayout = React.useCallback((
        _data: ArrayLike<FileListRow> | null | undefined,
        index: number,
    ) => listRowLayouts[index]!, [listRowLayouts]);

    React.useEffect(() => {
        setPrefetchRange({ start: 0, end: 8, lookahead: FILE_PREFETCH_LOOKAHEAD });
    }, [activeTab, searchQuery, gitStatusFiles]);

    const handleViewableItemsChanged = React.useRef(({
        viewableItems,
    }: {
        viewableItems: Array<ViewToken<FileListRow>>;
    }) => {
        let firstVisibleFile = Number.POSITIVE_INFINITY;
        let lastVisibleFile = -1;

        for (const token of viewableItems) {
            if (!token.isViewable || token.item.kind !== 'git-file') continue;
            firstVisibleFile = Math.min(firstVisibleFile, token.item.fileIndex);
            lastVisibleFile = Math.max(lastVisibleFile, token.item.fileIndex);
        }

        if (lastVisibleFile < 0) return;
        const start = firstVisibleFile;
        const end = lastVisibleFile + 1;
        setPrefetchRange((current) => (
            current.start === start && current.end === end
                ? current
                : { start, end, lookahead: FILE_PREFETCH_LOOKAHEAD }
        ));
    }).current;
    const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 10 }).current;

    const renderListRow = ({ item }: { item: FileListRow }) => {
        if (item.kind === 'section') {
            const isStagedSection = item.source === 'staged';
            return (
                <View style={[styles.sectionHeader, { borderBottomColor: theme.colors.divider }]}>
                    <Text style={[
                        styles.sectionHeaderText,
                        { color: isStagedSection ? theme.colors.success : theme.colors.warning },
                    ]}>
                        {t(isStagedSection ? 'files.stagedChanges' : 'files.unstagedChanges', { count: item.count })}
                    </Text>
                </View>
            );
        }

        if (item.kind === 'search-header') {
            return (
                <View style={[styles.searchResultsHeader, {
                    backgroundColor: theme.colors.surfaceHigh,
                    borderBottomColor: theme.colors.divider,
                }]}>
                    <Text style={[styles.searchResultsHeaderText, { color: theme.colors.textLink }]}>
                        {t('files.searchResults', { count: item.count })}
                    </Text>
                </View>
            );
        }

        if (item.kind === 'search-file') {
            return (
                <Item
                    title={item.file.fileName}
                    subtitle={item.file.filePath || t('files.projectRoot')}
                    icon={renderFileIconForSearch(item.file)}
                    onPress={() => handleFilePress(item.file)}
                    showDivider={!item.isLast}
                />
            );
        }

        return renderGitFileItem(
            item.file,
            item.sectionIndex,
            item.source,
            item.isLast,
        );
    };

    const renderEmptyList = () => {
        if (isLoading) {
            return (
                <View accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={styles.emptyState}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={[styles.emptyStateBody, { color: theme.colors.textSecondary }]}>{t('common.loading')}</Text>
                </View>
            );
        }

        if (gitStatusError && !gitStatusFiles) {
            return (
                <View accessibilityRole="alert" style={[styles.emptyState, styles.emptyStatePadded]}>
                    <Octicons name="alert" size={48} color={theme.colors.status.error} />
                    <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>{t('files.loadFailed')}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')} onPress={refreshGitStatus} style={styles.retryButton}>
                        <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
                    </Pressable>
                </View>
            );
        }

        if (!gitStatusFiles) {
            return (
                <View role="status" accessibilityLiveRegion="polite" style={[styles.emptyState, styles.emptyStatePadded]}>
                    <Octicons name="git-branch" size={48} color={theme.colors.textSecondary} />
                    <Text style={[styles.emptyStateTitle, { color: theme.colors.textSecondary }]}>
                        {t('files.notRepo')}
                    </Text>
                    <Text style={[styles.emptyStateBody, { color: theme.colors.textSecondary }]}>
                        {t('files.notUnderGit')}
                    </Text>
                </View>
            );
        }

        if (showSearchContent && searchError) {
            return (
                <View accessibilityRole="alert" style={[styles.emptyState, styles.emptyStatePadded]}>
                    <Octicons name="alert" size={48} color={theme.colors.status.error} />
                    <Text style={[styles.emptyStateTitle, { color: theme.colors.text }]}>{t('files.searchFailed')}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')} onPress={() => setSearchAttempt((attempt) => attempt + 1)} style={styles.retryButton}>
                        <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
                    </Pressable>
                </View>
            );
        }

        if (showSearchContent && isSearching) {
            return (
                <View accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={styles.emptyState}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={[styles.emptyStateTitle, { color: theme.colors.textSecondary }]}>
                        {t('files.searching')}
                    </Text>
                </View>
            );
        }

        if (showSearchContent) {
            return (
                <View role="status" accessibilityLiveRegion="polite" style={[styles.emptyState, styles.emptyStatePadded]}>
                    <Octicons name={searchQuery ? 'search' : 'file-directory'} size={48} color={theme.colors.textSecondary} />
                    <Text style={[styles.emptyStateTitle, { color: theme.colors.textSecondary }]}>
                        {searchQuery ? t('files.noFilesFound') : t('files.noFilesInProject')}
                    </Text>
                    {searchQuery ? (
                        <Text style={[styles.emptyStateBody, { color: theme.colors.textSecondary }]}>
                            {t('files.tryDifferentTerm')}
                        </Text>
                    ) : null}
                </View>
            );
        }

        return null;
    };

    return (
        <View role="main" style={[styles.container, { backgroundColor: theme.colors.canvas }]}>
            <ScreenReaderHeading title={t('files.changes')} />
            <View style={[styles.gitControlPanel, { backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.glass.border, shadowColor: theme.colors.glass.shadow }]}>
                <View style={[styles.searchBox, { backgroundColor: theme.colors.input.background, borderColor: theme.colors.glass.border }]}>
                    <Octicons name="search" size={15} color={theme.colors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        accessibilityLabel={t('files.searchPlaceholder')}
                        placeholder={t('files.searchPlaceholderCompact')}
                        style={[styles.searchInput, { color: theme.colors.text }]}
                        placeholderTextColor={theme.colors.input.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>

                {!isLoading && gitStatusFiles && (
                    <View style={styles.branchToolbar}>
                        <View style={styles.branchSummaryIdentity}>
                            <View style={[styles.branchSummaryIcon, { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.glass.border }]}>
                                <Octicons name="git-branch" size={14} color={theme.colors.accent} />
                            </View>
                            <View style={styles.branchSummaryCopy}>
                                <View style={styles.branchSummaryTitleRow}>
                                    <Text style={[styles.branchSummaryTitle, { color: theme.colors.text }]} numberOfLines={1}>
                                        {gitStatusFiles.branch || t('files.detachedHead')}
                                    </Text>
                                    {(aheadCount > 0 || behindCount > 0) && (
                                        <Text style={[styles.branchSummaryDivergence, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                            {aheadCount > 0 ? t('gitActions.ahead', { count: aheadCount }) : ''}
                                            {aheadCount > 0 && behindCount > 0 ? ' ' : ''}
                                            {behindCount > 0 ? t('gitActions.behind', { count: behindCount }) : ''}
                                        </Text>
                                    )}
                                </View>
                                <Text style={[styles.branchSummaryMeta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                    {t('files.summary', { staged: gitStatusFiles.totalStaged, unstaged: gitStatusFiles.totalUnstaged })}
                                </Text>
                            </View>
                        </View>
                        <Pressable
                            onPress={() => router.push(`/session/${sessionId}/git-log`)}
                            accessibilityRole="button"
                            accessibilityLabel={t('gitActions.gitLog')}
                            style={({ pressed }) => [
                                styles.gitLogButton,
                                {
                                    backgroundColor: theme.colors.accentSoft,
                                    borderColor: amberVisuals.borderColor,
                                    opacity: pressed ? 0.78 : 1,
                                },
                            ]}
                        >
                            <Octicons name="git-commit" size={13} color={theme.colors.accentDark} />
                            <Text style={[styles.gitLogButtonText, { color: theme.colors.text }]} numberOfLines={1}>
                                {t('gitActions.gitLog')}
                            </Text>
                        </Pressable>
                    </View>
                )}

                {showToolbar && !searchQuery && (
                    <View style={styles.actionRow}>
                        {toolbarActions.map((action) => {
                            const color = action.destructive
                                ? theme.colors.status.error
                                : action.muted
                                    ? theme.colors.textSecondary
                                    : theme.colors.accentDark;
                            const textColor = action.destructive ? theme.colors.status.error : theme.colors.text;

                            return (
                                <Pressable
                                    key={action.id}
                                    onPress={() => handleToolbarAction(action)}
                                    disabled={gitActions.loading}
                                    accessibilityRole="button"
                                    accessibilityLabel={t(action.labelKey)}
                                    accessibilityState={{ disabled: gitActions.loading, busy: gitActions.loading }}
                                    style={[
                                        styles.toolbarButton,
                                        { backgroundColor: action.destructive ? `${theme.colors.status.error}10` : theme.colors.input.background },
                                        gitActions.loading && styles.toolbarButtonDisabled,
                                    ]}
                                >
                                    <Octicons name={action.icon as any} size={16} color={color} />
                                    <Text style={[styles.toolbarButtonText, { color: textColor }]}>{t(action.labelKey)}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                )}

                {gitStatusError && gitStatusFiles ? (
                    <View accessibilityRole="alert" style={styles.inlineError}>
                        <Text style={[styles.inlineErrorText, { color: theme.colors.status.error }]}>{t('files.loadFailed')}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')} onPress={refreshGitStatus} style={styles.inlineRetryButton}>
                            <Text style={[styles.inlineRetryText, { color: theme.colors.accentDark }]}>{t('common.retry')}</Text>
                        </Pressable>
                    </View>
                ) : null}
            </View>

            {showFilters && (
                <View style={[styles.listHeader, { borderBottomColor: theme.colors.divider }]}>
                    <Text style={[styles.listHeaderTitle, { color: theme.colors.text }]} numberOfLines={1}>
                        {listHeaderTitle}
                    </Text>
                    <View accessibilityRole="tablist" style={styles.tabsWrap}>
                        {([
                            ['all', t('files.allChanges')],
                            ['staged', t('files.stagedTab')],
                            ['unstaged', t('files.unstagedTab')],
                        ] as Array<[GitFilterTab, string]>).map(([tab, label]) => {
                            const active = activeTab === tab;
                            return (
                                <Pressable
                                    key={tab}
                                    onPress={() => setActiveTab(tab)}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: active }}
                                    aria-selected={active}
                                    {...getSpaceKeyActivationProps(() => setActiveTab(tab))}
                                    style={[
                                        styles.tabButton,
                                        {
                                            backgroundColor: active ? theme.colors.accent : theme.colors.input.background,
                                            borderColor: active ? amberVisuals.borderColor : theme.colors.glass.border,
                                        },
                                    ]}
                                >
                                    {active ? (
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
                                                style={[styles.tabHighlight, { backgroundColor: amberVisuals.highlightColor }]}
                                            />
                                        </>
                                    ) : null}
                                    <Text style={[
                                        styles.tabButtonText,
                                        { color: active ? amberVisuals.textColor : theme.colors.textSecondary },
                                    ]}>
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            )}

            {/* Git Status List */}
            <ItemScaleProvider scale={fileListScale}>
                <FlatList
                    style={[styles.virtualizedList, { backgroundColor: theme.colors.canvas }]}
                    contentContainerStyle={[
                        styles.virtualizedListContent,
                        listRows.length === 0 && styles.virtualizedListEmptyContent,
                    ]}
                    data={listRows}
                    keyExtractor={(item) => item.key}
                    renderItem={renderListRow}
                    getItemLayout={getItemLayout}
                    ListEmptyComponent={renderEmptyList}
                    ListFooterComponent={<View style={styles.listFooter} />}
                    initialNumToRender={12}
                    maxToRenderPerBatch={12}
                    updateCellsBatchingPeriod={32}
                    windowSize={7}
                    removeClippedSubviews={Platform.OS !== 'web'}
                    onViewableItemsChanged={handleViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    keyboardShouldPersistTaps="handled"
                />
            </ItemScaleProvider>

        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        width: '100%',
    },
    gitControlPanel: {
        marginHorizontal: 12,
        marginTop: 10,
        marginBottom: 8,
        padding: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 10,
        gap: 8,
        shadowOpacity: theme.dark ? 0.14 : 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 1,
    },
    searchBox: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 8,
        paddingHorizontal: 10,
    },
    searchIcon: {
        marginRight: 7,
        flexShrink: 0,
    },
    searchInput: {
        flex: 1,
        minHeight: 44,
        fontSize: 14,
        ...Typography.default(),
    },
    branchToolbar: {
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    branchSummaryIdentity: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    branchSummaryIcon: {
        width: 28,
        height: 28,
        borderRadius: 7,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    branchSummaryCopy: {
        flex: 1,
        minWidth: 0,
        gap: 3,
    },
    branchSummaryTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        minWidth: 0,
    },
    branchSummaryTitle: {
        flexShrink: 1,
        minWidth: 0,
        fontSize: 15,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    branchSummaryDivergence: {
        flexShrink: 0,
        fontSize: 12,
        ...Typography.default(),
    },
    branchSummaryMeta: {
        fontSize: 11,
        ...Typography.default(),
    },
    gitLogButton: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 9,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 8,
        flexShrink: 0,
        cursor: 'pointer',
    },
    gitLogButtonText: {
        maxWidth: 90,
        fontSize: 12,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
    },
    inlineError: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    inlineErrorText: {
        flex: 1,
        fontSize: 13,
        ...Typography.default(),
    },
    inlineRetryButton: {
        minWidth: 72,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    inlineRetryText: {
        ...Typography.default('semiBold'),
    },
    listHeader: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
    },
    listHeaderTitle: {
        flex: 1,
        minWidth: 0,
        fontSize: 14,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    tabsWrap: {
        flexDirection: 'row',
        gap: 5,
        flexShrink: 0,
    },
    tabButton: {
        minWidth: 54,
        minHeight: 44,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 9,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    tabHighlight: {
        position: 'absolute',
        top: 1,
        left: 7,
        right: 7,
        height: 8,
        borderRadius: 8,
    },
    tabButtonText: {
        fontSize: 12,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    toolbarButton: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 7,
        paddingVertical: 6,
        borderRadius: 8,
        gap: 4,
        backgroundColor: theme.colors.input.background,
    },
    toolbarButtonDisabled: {
        opacity: 0.45,
    },
    toolbarButtonText: {
        fontSize: 12,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    virtualizedList: {
        flex: 1,
    },
    virtualizedListContent: {
        paddingTop: 0,
    },
    virtualizedListEmptyContent: {
        flexGrow: 1,
    },
    listFooter: {
        height: Platform.select({ ios: 34, default: 16 }),
    },
    searchResultsHeader: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
    },
    searchResultsHeaderText: {
        fontSize: 14,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 40,
    },
    emptyStatePadded: {
        paddingHorizontal: 20,
    },
    emptyStateTitle: {
        fontSize: 16,
        textAlign: 'center',
        marginTop: 16,
        ...Typography.default(),
    },
    emptyStateBody: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        ...Typography.default(),
    },
    retryButton: {
        minWidth: 88,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 14,
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: theme.colors.button.primary.background,
    },
    retryButtonText: {
        color: theme.colors.button.primary.tint,
        ...Typography.default('semiBold'),
    },
    sectionHeader: {
        minHeight: 34,
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
    },
    sectionHeaderText: {
        fontSize: 13,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
    statusBadge: {
        minHeight: 28,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 999,
        paddingHorizontal: 8,
        gap: 5,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        ...Typography.default('semiBold'),
    },
}));
