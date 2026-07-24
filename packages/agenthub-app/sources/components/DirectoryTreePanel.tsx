import * as React from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';
import { DirectoryTreeNode } from '@/components/DirectoryTreeNode';
import { Typography } from '@/constants/Typography';
import type { LocalTreeNode } from '@/hooks/useDirectoryTree';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import { useFileListScale } from '@/hooks/useScale';

interface DirectoryTreePanelProps {
    tree: LocalTreeNode[];
    isLoading: boolean;
    error: string | null;
    expanded: Set<string>;
    loadingPaths: Set<string>;
    onToggle: (path: string) => void;
    onFileSelect: (path: string, fileName: string) => void;
    onFileActions?: (node: LocalTreeNode, event: any) => void;
    selectedFilePath?: string | null;
    onClose?: () => void;
    onRetry?: () => void;
}

// Filter loaded tree nodes by query string
function filterTree(nodes: LocalTreeNode[], query: string): LocalTreeNode[] {
    if (!query) return nodes;
    const q = query.toLowerCase();
    const result: LocalTreeNode[] = [];
    for (const node of nodes) {
        if (node.type === 'file') {
            if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
                result.push(node);
            }
        } else {
            const filteredChildren = filterTree(node.children, query);
            if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
                result.push({ ...node, children: filteredChildren });
            }
        }
    }
    return result;
}

export const DirectoryTreePanel = React.memo<DirectoryTreePanelProps>(({
    tree,
    isLoading,
    error,
    expanded,
    loadingPaths,
    onToggle,
    onFileSelect,
    onFileActions,
    selectedFilePath,
    onClose,
    onRetry,
}) => {
    const { theme } = useUnistyles();
    const { s } = useFileListScale();
    const [query, setQuery] = React.useState('');

    const filteredTree = React.useMemo(
        () => filterTree(tree, query.trim()),
        [tree, query],
    );
    const showHeader = !!onClose;

    // When searching, auto-expand all directories so matches are visible
    const effectiveExpanded = query.trim()
        ? (() => {
            const allDirPaths = new Set<string>();
            const collect = (nodes: LocalTreeNode[]) => {
                for (const n of nodes) {
                    if (n.type === 'directory') {
                        allDirPaths.add(n.path);
                        collect(n.children);
                    }
                }
            };
            collect(filteredTree);
            return allDirPaths;
        })()
        : expanded;

    const isEmpty = tree.length === 0 && !isLoading && !error;

    return (
        <View style={styles.container}>
            {/* Header */}
            {showHeader ? (
                <View style={[styles.header, { paddingHorizontal: s(16), paddingTop: s(10), paddingBottom: s(4) }]}>
                    <View style={styles.headerActions}>
                        <Pressable
                            onPress={onClose}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.close')}
                            style={[styles.headerBtn, { borderRadius: s(6) }]}
                        >
                            <Octicons name="x" size={s(16)} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                </View>
            ) : null}

            {/* Search */}
            {tree.length > 0 && (
                <View style={[styles.searchWrap, { marginHorizontal: s(12), marginTop: showHeader ? 0 : s(12), marginBottom: s(6), paddingHorizontal: s(10), borderRadius: s(8), gap: s(6) }]}>
                    <Octicons name="search" size={s(14)} color={theme.colors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        accessibilityLabel={t('directoryTree.searchPlaceholder')}
                        placeholder={t('directoryTree.searchPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        style={[styles.searchInput, { fontSize: s(13) }]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                    />
                </View>
            )}

            {/* Tree content */}
            <ScrollView
                style={styles.list}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                accessibilityLabel={t('fileBrowser.title')}
                role="region"
                {...(Platform.OS === 'web' ? { tabIndex: 0 } : null)}
            >
                {isLoading ? (
                    <View accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={[styles.emptyState, { paddingHorizontal: s(24), paddingVertical: s(32), gap: s(8) }]}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        <Text style={[styles.emptySubtitle, { fontSize: s(13) }]}>{t('directoryTree.loading')}</Text>
                    </View>
                ) : error ? (
                    <View accessibilityRole="alert" style={[styles.emptyState, { paddingHorizontal: s(24), paddingVertical: s(32), gap: s(8) }]}>
                        <Octicons name="alert" size={s(24)} color={theme.colors.textSecondary} />
                        <Text style={[styles.emptySubtitle, { fontSize: s(13) }]}>{t('directoryTree.loadFailed')}</Text>
                        {onRetry ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t('common.retry')}
                                onPress={onRetry}
                                style={styles.retryButton}
                            >
                                <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : isEmpty ? (
                    <View role="status" accessibilityLiveRegion="polite" style={[styles.emptyState, { paddingHorizontal: s(24), paddingVertical: s(32), gap: s(8) }]}>
                        <Octicons name="file-directory" size={s(24)} color={theme.colors.textSecondary} />
                        <Text style={[styles.emptySubtitle, { fontSize: s(13) }]}>{t('directoryTree.emptyDirectory')}</Text>
                    </View>
                ) : filteredTree.length === 0 ? (
                    <View role="status" accessibilityLiveRegion="polite" style={[styles.emptyState, { paddingHorizontal: s(24), paddingVertical: s(32), gap: s(8) }]}>
                        <Text style={[styles.emptySubtitle, { fontSize: s(13) }]}>{t('directoryTree.noFilesFound')}</Text>
                    </View>
                ) : (
                    <View style={[styles.tree, { paddingHorizontal: s(4) }]}>
                        {filteredTree.map((node) => (
                            <DirectoryTreeNode
                                key={node.path}
                                node={node}
                                depth={0}
                                expanded={effectiveExpanded}
                                selectedFilePath={selectedFilePath ?? null}
                                loadingPaths={loadingPaths}
                                onToggle={onToggle}
                                onFileSelect={onFileSelect}
                                onFileActions={onFileActions}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 8,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    headerBtn: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
    },
    searchWrap: {
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginBottom: 6,
        paddingHorizontal: 10,
        paddingVertical: 0,
        borderRadius: 8,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        gap: 6,
    },
    searchIcon: {
        opacity: 0.8,
    },
    searchInput: {
        flex: 1,
        minHeight: 44,
        fontSize: 13,
        color: theme.colors.text,
        ...Typography.default(),
        padding: 0,
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null),
    },
    list: {
        flex: 1,
    },
    listContent: {
        flexGrow: 1,
        paddingBottom: 16,
    },
    tree: {
        paddingHorizontal: 4,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingVertical: 32,
        gap: 8,
    },
    emptySubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
    },
    retryButton: {
        minHeight: 44,
        minWidth: 88,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: theme.colors.accent,
    },
    retryButtonText: {
        color: theme.colors.button.primary.tint,
        ...Typography.default('semiBold'),
    },
}));
