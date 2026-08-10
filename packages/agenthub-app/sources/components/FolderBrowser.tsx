import * as React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { Typography } from '@/constants/Typography';
import { machineListDirectory, machineCreateDirectory } from '@/sync/ops';
import type { DirectoryEntry } from '@/sync/ops';
import { FolderIcon } from '@/components/FolderIcon';
import { Modal } from '@/modal';
import { getParentDirectory } from '@/components/folderBrowserPath';
import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';
import { sync } from '@/sync/sync';

export interface FolderBrowserProps {
    machineId: string;
    homeDir?: string;
    initialPath?: string;
    recentPaths?: string[];
    onSelectPath: (absolutePath: string) => void;
    onCurrentPathChange?: (absolutePath: string) => void;
    onDismiss?: () => void;
}

export const FolderBrowser = React.memo<FolderBrowserProps>(({
    machineId,
    homeDir,
    initialPath,
    recentPaths,
    onCurrentPathChange,
}) => {
    const { theme } = useUnistyles();
    const startPath = initialPath || homeDir || '/';

    const [currentPath, setCurrentPath] = React.useState(startPath);
    const [entries, setEntries] = React.useState<DirectoryEntry[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [showHidden, setShowHidden] = React.useState(false);
    const [cache] = React.useState(new Map<string, DirectoryEntry[]>());

    const loadDirectory = React.useCallback((path: string) => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;
        setIsLoading(true);
        setError(null);
        void runSessionActionRequest({
            isCurrent,
            request: () => machineListDirectory(machineId, path),
        }).then((result) => {
            if (result === null || !isCurrent()) return;
            if (result.success && result.entries) {
                const dirs = result.entries.filter((e) => e.type === 'directory');
                cache.set(path, dirs);
                setEntries(dirs);
                setCurrentPath(path);
            } else {
                setError(result.error || t('newSession.folderNotFound'));
            }
        }).catch(() => {
            if (isCurrent()) setError(t('newSession.noAccess'));
        }).finally(() => {
            if (isCurrent()) setIsLoading(false);
        });
    }, [machineId, cache]);

    React.useEffect(() => {
        loadDirectory(startPath);
    }, [startPath, loadDirectory]);

    React.useEffect(() => {
        onCurrentPathChange?.(currentPath);
    }, [currentPath, onCurrentPathChange]);

    const navigateTo = React.useCallback((path: string) => {
        if (cache.has(path)) {
            setEntries(cache.get(path)!);
            setCurrentPath(path);
            setError(null);
        } else {
            loadDirectory(path);
        }
    }, [cache, loadDirectory]);

    const navigateToBreadcrumb = React.useCallback((path: string) => {
        if (cache.has(path)) {
            setEntries(cache.get(path)!);
            setCurrentPath(path);
            setError(null);
        } else {
            loadDirectory(path);
        }
    }, [cache, loadDirectory]);

    const parentDirectory = React.useMemo(() => getParentDirectory(currentPath), [currentPath]);
    const navigateToParentDirectory = React.useCallback(() => {
        if (!parentDirectory) return;
        navigateTo(parentDirectory);
    }, [navigateTo, parentDirectory]);

    const handleRecentPress = React.useCallback((path: string) => {
        if (cache.has(path)) {
            setEntries(cache.get(path)!);
            setCurrentPath(path);
            setError(null);
        } else {
            loadDirectory(path);
        }
    }, [cache, loadDirectory]);

    const handleCreateFolder = React.useCallback(async () => {
        const generation = sync.getAccountGeneration();
        const isCurrent = () => generation !== null && sync.getAccountGeneration() === generation;
        if (!isCurrent()) return;
        const name = await Modal.prompt(
            t('newSession.newFolder'),
            undefined,
            { placeholder: t('newSession.newFolderName'), cancelText: t('common.cancel'), confirmText: t('common.create') }
        );
        if (!isCurrent() || !name?.trim()) return;
        const newPath = currentPath === '/' ? `/${name.trim()}` : `${currentPath}/${name.trim()}`;
        const result = await runSessionActionRequest({
            isCurrent,
            request: () => machineCreateDirectory(machineId, newPath),
        });
        if (result === null || !isCurrent()) return;
        if (!result.success) {
            Modal.alert(t('newSession.createFolderError'), result.error || t('common.unknownError'), [{ text: t('common.ok'), style: 'cancel' }]);
            return;
        }
        cache.delete(currentPath);
        navigateTo(newPath);
    }, [currentPath, machineId, cache, navigateTo]);

    const filteredEntries = React.useMemo(() => {
        if (showHidden) return entries;
        return entries.filter((e) => !e.name.startsWith('.'));
    }, [entries, showHidden]);

    const segments = React.useMemo(() => {
        if (homeDir && currentPath === homeDir) {
            return ['~'];
        }
        if (homeDir && currentPath.startsWith(homeDir + '/')) {
            const rest = currentPath.slice(homeDir.length + 1);
            return ['~', ...rest.split('/').filter(Boolean)];
        }
        const parts = currentPath.split('/').filter(Boolean);
        if (currentPath.startsWith('/')) {
            parts.unshift('/');
        }
        return parts;
    }, [currentPath, homeDir]);

    const controlColor = theme.colors.text;
    const controlMutedColor = theme.colors.textSecondary;

    return (
        <View style={styles.container}>
            {/* Breadcrumb bar */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.breadcrumbScroll}
                contentContainerStyle={styles.breadcrumbContent}
            >
                {homeDir && (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('common.home')}
                        onPress={() => handleRecentPress(homeDir)}
                        hitSlop={4}
                        style={styles.breadcrumbChip}
                    >
                        <Ionicons name="home-outline" size={13} color={theme.colors.textSecondary} />
                    </Pressable>
                )}
                {segments.map((seg, i) => {
                    let segPath: string;
                    if (seg === '~' && homeDir) {
                        segPath = homeDir;
                    } else if (homeDir && segments[0] === '~') {
                        const restParts = segments.slice(1, i + 1);
                        segPath = homeDir + (restParts.length > 0 ? '/' + restParts.join('/') : '');
                    } else if (i === 0 && seg === '/') {
                        segPath = '/';
                    } else {
                        segPath = currentPath.split('/').slice(0, currentPath.startsWith('/') ? i + 1 : i + 1).join('/') || '/';
                    }
                    const isLast = i === segments.length - 1;
                    return (
                        <React.Fragment key={`${seg}-${i}`}>
                            {i > 0 && <Text style={[styles.breadcrumbSep, { color: theme.colors.textSecondary }]}>/</Text>}
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={seg === '~' ? t('common.home') : seg}
                                accessibilityState={{ disabled: isLast }}
                                onPress={() => !isLast && navigateToBreadcrumb(segPath)}
                                hitSlop={4}
                                disabled={isLast}
                            >
                                <Text
                                    style={[
                                        styles.breadcrumbText,
                                        { color: isLast ? theme.colors.text : theme.colors.textSecondary },
                                    ]}
                                    numberOfLines={1}
                                >
                                    {seg === '~' ? '~' : seg}
                                </Text>
                            </Pressable>
                        </React.Fragment>
                    );
                })}
            </ScrollView>

            {/* Hidden toggle + new folder */}
            <View style={styles.controlsRow}>
                <View style={styles.controlsLeft}>
                    {parentDirectory && (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('newSession.parentFolder')}
                            onPress={navigateToParentDirectory}
                            hitSlop={4}
                            style={({ pressed }) => [
                                styles.controlButton,
                                styles.parentControlButton,
                                { backgroundColor: theme.colors.surfaceHighest, borderColor: theme.colors.divider },
                                pressed && styles.buttonPressed,
                            ]}
                        >
                            <Ionicons name="arrow-up" size={15} color={controlColor} />
                            <Text style={[styles.controlButtonText, styles.controlButtonTextStrong, { color: controlColor }]}>
                                {t('newSession.parentFolder')}
                            </Text>
                        </Pressable>
                    )}
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('newSession.showHidden')}
                        accessibilityState={{ selected: showHidden }}
                        onPress={() => setShowHidden((v) => !v)}
                        style={({ pressed }) => [
                            styles.controlButton,
                            { backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.divider },
                            pressed && styles.buttonPressed,
                        ]}
                        hitSlop={4}
                    >
                        <Ionicons
                            name={showHidden ? 'eye-outline' : 'eye-off-outline'}
                            size={15}
                            color={controlMutedColor}
                        />
                        <Text style={[styles.controlButtonText, { color: controlMutedColor }]}>
                            {t('newSession.showHidden')}
                        </Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('newSession.newFolder')}
                        onPress={handleCreateFolder}
                        style={({ pressed }) => [
                            styles.controlButton,
                            styles.controlButtonPrimary,
                            { backgroundColor: theme.colors.surfaceHighest, borderColor: theme.colors.divider },
                            pressed && styles.buttonPressed,
                        ]}
                        hitSlop={4}
                    >
                        <Ionicons name="add-circle-outline" size={15} color={controlColor} />
                        <Text style={[styles.controlButtonText, styles.controlButtonTextStrong, { color: controlColor }]}>
                            {t('newSession.newFolder')}
                        </Text>
                    </Pressable>
                </View>
            </View>

            {/* Recent paths */}
            {recentPaths && recentPaths.length > 0 && (
                <View style={styles.recentRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {recentPaths.slice(0, 5).map((p) => {
                            const label = homeDir && p.startsWith(homeDir)
                                ? '~' + p.slice(homeDir.length)
                                : p.split('/').pop() || p;
                            return (
                                <Pressable
                                    key={p}
                                    accessibilityRole="button"
                                    accessibilityLabel={label}
                                    onPress={() => handleRecentPress(p)}
                                    style={({ pressed }) => [
                                        styles.recentChip,
                                        { backgroundColor: theme.colors.input.background },
                                        pressed && { opacity: 0.6 },
                                    ]}
                                >
                                    <FolderIcon size={12} />
                                    <Text style={[styles.recentChipText, { color: theme.colors.text }]} numberOfLines={1}>
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {/* Content */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                        {t('common.loading')}
                    </Text>
                </View>
            ) : error ? (
                <View style={styles.errorContainer}>
                    <Ionicons name="lock-closed-outline" size={28} color={theme.colors.textSecondary} />
                    <Text style={[styles.errorText, { color: theme.colors.textSecondary }]}>
                        {error}
                    </Text>
                    {parentDirectory && (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t('newSession.parentFolder')}
                            onPress={navigateToParentDirectory}
                            style={styles.errorBack}
                        >
                            <Text style={[styles.errorBackText, { color: theme.colors.button.primary.background }]}>
                                {t('newSession.parentFolder')}
                            </Text>
                        </Pressable>
                    )}
                </View>
            ) : filteredEntries.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="folder-open-outline" size={28} color={theme.colors.textSecondary} />
                    <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                        {t('newSession.emptyFolder')}
                    </Text>
                </View>
            ) : (
                <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                    {filteredEntries.map((entry) => (
                        <Pressable
                            key={entry.name}
                            accessibilityRole="button"
                            accessibilityLabel={entry.name}
                            onPress={() => navigateTo(currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`)}
                            style={({ pressed }) => [
                                styles.dirRow,
                                { backgroundColor: theme.colors.input.background },
                                pressed && styles.dirRowPressed,
                            ]}
                        >
                            <FolderIcon size={16} />
                            <Text
                                style={[
                                    styles.dirName,
                                    { color: theme.colors.text },
                                    entry.name.startsWith('.') && { opacity: 0.5 },
                                ]}
                                numberOfLines={1}
                            >
                                {entry.name}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                        </Pressable>
                    ))}
                </ScrollView>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        minHeight: 0,
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        fontSize: 18,
        paddingVertical: 12,
        paddingHorizontal: 4,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    breadcrumbScroll: {
        maxHeight: 44,
        marginBottom: 8,
    } as const,
    breadcrumbContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
    } as const,
    breadcrumbBack: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        flexShrink: 0,
    },
    parentFolderButton: {
        height: 36,
        minWidth: 86,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        flexShrink: 0,
    },
    parentText: {
        fontSize: 13,
        ...Typography.default('semiBold'),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    breadcrumbChip: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    breadcrumbSep: {
        fontSize: 13,
        ...Typography.default(),
    } as const,
    breadcrumbText: {
        fontSize: 13,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
    selectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 8,
    },
    selectButtonPressed: {
        opacity: 0.8,
    } as const,
    selectButtonText: {
        fontSize: 15,
        ...Typography.default('semiBold'),
    } as const,
    controlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingBottom: 6,
    },
    controlsLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    controlButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 34,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
    },
    controlButtonPrimary: {
        minWidth: 96,
    },
    parentControlButton: {
        minWidth: 76,
    },
    controlButtonText: {
        fontSize: 12,
        ...Typography.default(),
    } as const,
    controlButtonTextStrong: {
        ...Typography.default('semiBold'),
    } as const,
    buttonPressed: {
        opacity: 0.7,
    } as const,
    recentRow: {
        paddingBottom: 6,
    },
    recentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        marginRight: 6,
    },
    recentChipText: {
        fontSize: 12,
        ...Typography.default(),
    } as const,
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        gap: 8,
    },
    loadingText: {
        fontSize: 14,
        ...Typography.default(),
    } as const,
    errorContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
        gap: 8,
    },
    errorText: {
        fontSize: 14,
        textAlign: 'center',
        ...Typography.default(),
    } as const,
    errorBack: {
        paddingVertical: 4,
    },
    errorBackText: {
        fontSize: 14,
        ...Typography.default('semiBold'),
    } as const,
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
        gap: 8,
    },
    emptyText: {
        fontSize: 14,
        ...Typography.default(),
    } as const,
    list: {
        flex: 1,
        minHeight: 0,
    } as const,
    dirRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderRadius: 12,
        marginBottom: 4,
    },
    dirRowPressed: {
        opacity: 0.6,
    } as const,
    dirName: {
        flex: 1,
        fontSize: 15,
        ...Typography.default(),
        ...Platform.select({ web: { userSelect: 'none' } as any, default: {} }),
    } as const,
}));
