import * as React from 'react';
import {
    View,
    Text,
    Pressable,
    FlatList,
    TextInput,
    ActivityIndicator,
    Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { hapticsLight } from './haptics';
import { getAmberRaisedButtonVisuals } from './amberVisuals';
import { searchFiles, loadAllFiles, type FileItem } from '@/sync/suggestionFile';
import { t } from '@/text';
import { FileIcon } from '@/components/FileIcon';
import { FolderIcon } from '@/components/FolderIcon';
import { useFileListScale } from '@/hooks/useScale';

interface FileReferencePickerProps {
    sessionId: string;
    selectedPaths: Set<string>;
    onConfirm: (paths: Set<string>) => void;
    onDismiss: () => void;
}

export const FileReferencePicker = React.memo(function FileReferencePicker(props: FileReferencePickerProps) {
    const { sessionId, selectedPaths, onConfirm, onDismiss } = props;

    const { theme } = useUnistyles();
    const { s } = useFileListScale();
    const amberVisuals = getAmberRaisedButtonVisuals(theme);

    const [searchQuery, setSearchQuery] = React.useState('');
    const [results, setResults] = React.useState<FileItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [localSelected, setLocalSelected] = React.useState<Set<string>>(() => new Set(selectedPaths));
    const [currentPath, setCurrentPath] = React.useState('');
    const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load initial file list
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const allFiles = await loadAllFiles(sessionId);
                if (!cancelled) {
                    setResults(allFiles);
                    setLoading(false);
                }
            } catch {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [sessionId]);

    // Debounced search
    const handleSearchChange = React.useCallback((text: string) => {
        setSearchQuery(text);
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        searchTimeoutRef.current = setTimeout(async () => {
            if (text.trim() === '') {
                const allFiles = await loadAllFiles(sessionId);
                setResults(allFiles);
            } else {
                const searchResults = await searchFiles(sessionId, text, { limit: 200 });
                setResults(searchResults);
            }
        }, 200);
    }, [sessionId]);

    const toggleSelection = React.useCallback((path: string) => {
        hapticsLight();
        setLocalSelected((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    }, []);

    const navigateToFolder = React.useCallback((folderPath: string) => {
        hapticsLight();
        setCurrentPath(folderPath);
    }, []);

    const navigateToParent = React.useCallback(() => {
        hapticsLight();
        if (currentPath === '') return;
        // Remove trailing slash, then get parent
        const trimmed = currentPath.replace(/\/$/, '');
        const lastSlash = trimmed.lastIndexOf('/');
        if (lastSlash <= 0) {
            setCurrentPath('');
        } else {
            setCurrentPath(trimmed.substring(0, lastSlash + 1));
        }
    }, [currentPath]);

    const navigateToBreadcrumb = React.useCallback((path: string) => {
        hapticsLight();
        setCurrentPath(path);
    }, []);

    const handleConfirm = React.useCallback(() => {
        hapticsLight();
        onConfirm(localSelected);
    }, [localSelected, onConfirm]);

    // Filter and sort results based on current path and search
    const displayResults = React.useMemo(() => {
        const isSearching = searchQuery.trim() !== '';
        if (isSearching) {
            return results;
        }
        // Show only direct children of currentPath
        const filtered = results.filter((item) => item.filePath === currentPath);
        // Sort: folders first, then alphabetical
        return filtered.sort((a, b) => {
            if (a.fileType !== b.fileType) {
                return a.fileType === 'folder' ? -1 : 1;
            }
            return a.fileName.localeCompare(b.fileName);
        });
    }, [results, currentPath, searchQuery]);

    // Breadcrumb segments
    const breadcrumbs = React.useMemo(() => {
        if (currentPath === '') return [];
        const parts = currentPath.replace(/\/$/, '').split('/');
        return parts.map((name, index) => ({
            name,
            path: parts.slice(0, index + 1).join('/') + '/',
        }));
    }, [currentPath]);

    const isSearching = searchQuery.trim() !== '';

    const renderItem = React.useCallback(({ item }: { item: FileItem }) => {
        const isSelected = localSelected.has(item.fullPath);
        const isFolder = item.fileType === 'folder';
        return (
            <Pressable
                onPress={() => toggleSelection(item.fullPath)}
                style={(p) => [
                    styles.itemRow,
                    {
                        paddingHorizontal: s(16),
                        paddingVertical: s(7),
                        gap: s(8),
                        minHeight: s(42),
                    },
                    isSelected && styles.itemRowSelected,
                    p.pressed && { opacity: 0.7 },
                ]}
            >
                <View style={[styles.checkbox, { width: s(18), height: s(18), borderRadius: s(5) }, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={s(13)} color="#fff" />}
                </View>
                {isFolder ? (
                    <FolderIcon size={s(20)} />
                ) : (
                    <FileIcon fileName={item.fileName} size={s(24)} />
                )}
                <View style={styles.itemTextContainer}>
                    <Text style={[styles.itemName, { fontSize: s(14), lineHeight: s(20) }]} numberOfLines={1}>
                        {isFolder ? item.fullPath : item.fileName}
                    </Text>
                    {!isFolder && item.filePath !== '' && (
                        <Text style={[styles.itemPath, { fontSize: s(12), lineHeight: s(17) }]} numberOfLines={1}>
                            {item.filePath}
                        </Text>
                    )}
                </View>
                {isFolder && (
                    <Pressable
                        onPress={() => navigateToFolder(item.fullPath)}
                        hitSlop={12}
                        style={(p) => [styles.chevronButton, { width: s(30), height: s(30) }, p.pressed && { opacity: 0.5 }]}
                    >
                        <Ionicons name="chevron-forward" size={s(18)} color={theme.colors.textSecondary} />
                    </Pressable>
                )}
            </Pressable>
        );
    }, [localSelected, navigateToFolder, s, theme.colors.textSecondary, toggleSelection]);

    const renderParentRow = React.useCallback(() => {
        if (isSearching || currentPath === '') return null;
        return (
            <Pressable
                onPress={navigateToParent}
                style={(p) => [styles.itemRow, { paddingHorizontal: s(16), paddingVertical: s(7), gap: s(8), minHeight: s(42) }, p.pressed && { opacity: 0.7 }]}
            >
                <View style={[styles.parentIcon, { width: s(18), height: s(18) }]}>
                    <Ionicons name="arrow-back" size={s(16)} color={theme.colors.textSecondary} />
                </View>
                <Text style={[styles.parentText, { fontSize: s(14), lineHeight: s(20) }]}>..</Text>
            </Pressable>
        );
    }, [currentPath, isSearching, navigateToParent, s, theme.colors.textSecondary]);

    return (
        <View style={styles.root}>
            {/* Header */}
            <View style={[styles.header, { paddingHorizontal: s(16), paddingVertical: s(12) }]}>
                <Pressable onPress={onDismiss} hitSlop={12} style={(p) => [styles.headerButton, { width: s(36), height: s(36) }, p.pressed && { opacity: 0.7 }]}>
                    <Ionicons name="close" size={s(24)} style={styles.headerIcon} />
                </Pressable>
                <Text style={[styles.headerTitle, { fontSize: s(17), lineHeight: s(23) }]}>
                    {t('fileReferencePicker.title')}
                </Text>
                <Pressable
                    onPress={handleConfirm}
                    hitSlop={12}
                    style={(p) => [
                        styles.doneButton,
                        {
                            borderRadius: s(16),
                            paddingHorizontal: s(16),
                            paddingVertical: s(8),
                            height: s(36),
                            borderColor: amberVisuals.borderColor,
                            shadowColor: amberVisuals.shadowColor,
                        },
                        p.pressed && { opacity: 0.7 },
                    ]}
                >
                    <LinearGradient
                        pointerEvents="none"
                        colors={amberVisuals.colors}
                        start={{ x: 0.18, y: 0 }}
                        end={{ x: 0.92, y: 1 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: s(16) }]}
                    />
                    <View
                        pointerEvents="none"
                        style={[styles.doneButtonHighlight, { backgroundColor: amberVisuals.highlightColor }]}
                    />
                    <Text style={[styles.doneButtonText, { fontSize: s(14), color: amberVisuals.textColor }]}>
                        {t('fileReferencePicker.selectedCount', { count: localSelected.size })}
                    </Text>
                </Pressable>
            </View>

            {/* Search */}
            <View style={[styles.searchContainer, { marginHorizontal: s(16), marginBottom: s(8), paddingHorizontal: s(12), height: s(40), borderRadius: s(12), gap: s(8) }]}>
                <Ionicons name="search" size={s(18)} style={styles.searchIcon} />
                <TextInput
                    style={[styles.searchInput, { fontSize: s(15), height: s(40) }]}
                    placeholder={t('fileReferencePicker.searchPlaceholder')}
                    placeholderTextColor={theme.colors.textSecondary}
                    value={searchQuery}
                    onChangeText={handleSearchChange}
                    autoFocus
                    returnKeyType="done"
                    clearButtonMode="while-editing"
                />
            </View>

            {/* Breadcrumb */}
            {!isSearching && breadcrumbs.length > 0 && (
                <View style={[styles.breadcrumbBar, { paddingHorizontal: s(16), paddingVertical: s(6), gap: s(2) }]}>
                    <Pressable
                        onPress={() => navigateToBreadcrumb('')}
                        hitSlop={4}
                        style={(p) => [styles.breadcrumbItem, p.pressed && { opacity: 0.7 }]}
                    >
                        <Ionicons name="home" size={s(14)} color={theme.colors.textLink} />
                    </Pressable>
                    {breadcrumbs.map((seg, index) => (
                        <React.Fragment key={seg.path}>
                            <Ionicons name="chevron-forward" size={s(12)} style={styles.breadcrumbSep} />
                            <Pressable
                                onPress={() => navigateToBreadcrumb(seg.path)}
                                hitSlop={4}
                                style={(p) => [styles.breadcrumbItem, p.pressed && { opacity: 0.7 }]}
                            >
                                <Text
                                    style={[
                                        styles.breadcrumbText,
                                        { fontSize: s(13), lineHeight: s(18) },
                                        index === breadcrumbs.length - 1 && styles.breadcrumbTextActive,
                                    ]}
                                    numberOfLines={1}
                                >
                                    {seg.name}
                                </Text>
                            </Pressable>
                        </React.Fragment>
                    ))}
                </View>
            )}

            {/* Selected count */}
            {localSelected.size > 0 && (
                <View style={[styles.selectedBar, { paddingHorizontal: s(16), paddingVertical: s(6) }]}>
                    <Text style={[styles.selectedText, { fontSize: s(13), lineHeight: s(18) }]}>
                        {t('fileReferencePicker.selectedCount', { count: localSelected.size })}
                    </Text>
                </View>
            )}

            {/* File list */}
            {loading ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" />
                    <Text style={styles.loadingText}>
                        {t('fileReferencePicker.loading')}
                    </Text>
                </View>
            ) : displayResults.length === 0 && currentPath === '' ? (
                <View style={styles.centerContent}>
                    <Ionicons name="folder-open-outline" size={s(48)} style={styles.emptyIcon} />
                    <Text style={[styles.emptyText, { fontSize: s(15), lineHeight: s(21) }]}>
                        {t('fileReferencePicker.emptyState')}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={displayResults}
                    keyExtractor={(item) => item.fullPath}
                    renderItem={renderItem}
                    ListHeaderComponent={renderParentRow}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.listContent}
                    initialNumToRender={50}
                    maxToRenderPerBatch={50}
                    windowSize={5}
                />
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    root: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
        paddingTop: Platform.select({ ios: 60, default: 40 }),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerIcon: {
        color: theme.colors.text,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.text,
    },
    doneButton: {
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 8,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        overflow: 'hidden',
        shadowOpacity: 0.5,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
    },
    doneButtonHighlight: {
        position: 'absolute',
        top: 3,
        left: 8,
        right: 8,
        height: 7,
        borderRadius: 999,
    },
    doneButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        height: 40,
        backgroundColor: theme.colors.surfacePressed,
        borderRadius: 12,
        gap: 8,
    },
    searchIcon: {
        color: theme.colors.textSecondary,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: theme.colors.text,
        height: 40,
        lineHeight: 20,
        paddingTop: 0,
        paddingBottom: 0,
        textAlignVertical: 'center',
    },
    breadcrumbBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 6,
        gap: 2,
    },
    breadcrumbItem: {
        paddingHorizontal: 4,
        paddingVertical: 2,
    },
    breadcrumbText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
    breadcrumbTextActive: {
        color: theme.colors.text,
        fontWeight: '500',
    },
    breadcrumbSep: {
        color: theme.colors.textSecondary,
        opacity: 0.5,
    },
    selectedBar: {
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    selectedText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 10,
    },
    itemRowSelected: {
        backgroundColor: theme.colors.surfacePressed,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: theme.colors.radio.active,
        borderColor: theme.colors.radio.active,
    },
    itemTextContainer: {
        flex: 1,
        gap: 1,
    },
    itemName: {
        fontSize: 14,
        color: theme.colors.text,
        fontWeight: '500',
    },
    itemPath: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
    chevronButton: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    parentIcon: {
        width: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    parentText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },
    listContent: {
        paddingBottom: 40,
    },
    centerContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingBottom: 80,
    },
    emptyIcon: {
        color: theme.colors.textSecondary,
        opacity: 0.5,
    },
    emptyText: {
        fontSize: 15,
        color: theme.colors.textSecondary,
    },
    loadingText: {
        fontSize: 15,
        color: theme.colors.textSecondary,
    },
}));
