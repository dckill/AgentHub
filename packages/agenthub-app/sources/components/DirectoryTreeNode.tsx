import * as React from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { FileIcon } from '@/components/FileIcon';
import { FolderIcon } from '@/components/FolderIcon';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import type { LocalTreeNode } from '@/hooks/useDirectoryTree';
import { useFileListScale } from '@/hooks/useScale';
import { getDirectoryTreeNodePaddingLeft } from './directoryTreeLayout';
import { getDirectoryTreeRowMetrics } from './directoryTreeMetrics';

const CHEVRON_DURATION = 160;
const EASING = Easing.out(Easing.cubic);

interface DirectoryTreeNodeProps {
    node: LocalTreeNode;
    depth: number;
    expanded: Set<string>;
    selectedFilePath: string | null;
    loadingPaths: Set<string>;
    onToggle: (path: string) => void;
    onFileSelect: (path: string, fileName: string) => void;
    onFileActions?: (node: LocalTreeNode, event: any) => void;
}

export const DirectoryTreeNode = React.memo(function DirectoryTreeNode({
    node,
    depth,
    expanded,
    selectedFilePath,
    loadingPaths,
    onToggle,
    onFileSelect,
    onFileActions,
}: DirectoryTreeNodeProps) {
    const { theme } = useUnistyles();
    const { s } = useFileListScale();
    const leftPad = getDirectoryTreeNodePaddingLeft(depth, s);
    const rowMetrics = getDirectoryTreeRowMetrics(s, Platform.OS !== 'web');

    if (node.type === 'directory') {
        const isExpanded = expanded.has(node.path);
        const isLoading = loadingPaths.has(node.path);
        return (
            <View>
                <Pressable
                    onPress={() => onToggle(node.path)}
                    accessibilityRole="button"
                    accessibilityLabel={node.name}
                    accessibilityState={{ expanded: isExpanded, busy: isLoading }}
                    style={({ pressed }) => [
                        styles.row,
                        { minHeight: rowMetrics.rowMinHeight, paddingLeft: leftPad, gap: s(8), paddingRight: s(12), paddingVertical: s(6), borderRadius: s(7) },
                        pressed && styles.rowPressed,
                    ]}
                >
                    <View style={[styles.chevron, { width: s(14) }]}>
                        <AnimatedChevron collapsed={!isExpanded} color={theme.colors.textSecondary} size={rowMetrics.chevronSize} />
                    </View>
                    <FolderIcon expanded={isExpanded} size={rowMetrics.folderIconSize} />
                    <Text style={[styles.dirName, { fontSize: rowMetrics.fontSize, lineHeight: rowMetrics.lineHeight }]} numberOfLines={1}>{node.name}</Text>
                    {isLoading && (
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} style={[styles.loader, { marginLeft: s(4) }]} />
                    )}
                </Pressable>
                {isExpanded
                    ? node.children.map((child) => (
                        <DirectoryTreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            expanded={expanded}
                            selectedFilePath={selectedFilePath}
                            loadingPaths={loadingPaths}
                            onToggle={onToggle}
                            onFileSelect={onFileSelect}
                            onFileActions={onFileActions}
                        />
                    ))
                    : null}
            </View>
        );
    }

    const isSelected = selectedFilePath === node.path;
    return (
        <Pressable
            onPress={() => onFileSelect(node.path, node.name)}
            onLongPress={(event) => onFileActions?.(node, event)}
            accessibilityRole="button"
            accessibilityLabel={node.name}
            accessibilityState={{ selected: isSelected }}
            {...(Platform.OS === 'web' ? {
                onContextMenu: (event: any) => {
                    event.preventDefault?.();
                    onFileActions?.(node, event);
                },
            } as any : {})}
            style={({ pressed }) => [
                styles.row,
                { minHeight: rowMetrics.rowMinHeight, paddingLeft: leftPad, gap: s(8), paddingRight: s(12), paddingVertical: s(6), borderRadius: s(7) },
                pressed && styles.rowPressed,
                isSelected && styles.rowSelected,
            ]}
        >
            <View style={[styles.chevronGutter, { width: s(14) }]} />
            <FileIcon fileName={node.name} size={rowMetrics.fileIconSize} />
            <Text style={[styles.fileName, { fontSize: rowMetrics.fontSize, lineHeight: rowMetrics.lineHeight }]} numberOfLines={1}>{node.name}</Text>
        </Pressable>
    );
});

const AnimatedChevron = React.memo(function AnimatedChevron({
    collapsed,
    color,
    size = 12,
}: {
    collapsed: boolean;
    color: string;
    size?: number;
}) {
    const rotation = useSharedValue(collapsed ? 0 : 90);
    React.useEffect(() => {
        rotation.value = withTiming(collapsed ? 0 : 90, {
            duration: CHEVRON_DURATION,
            easing: EASING,
        });
    }, [collapsed, rotation]);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));
    return (
        <Animated.View style={animatedStyle}>
            <Octicons name="chevron-right" size={size} color={color} />
        </Animated.View>
    );
});

const styles = StyleSheet.create((theme) => ({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingRight: 12,
        paddingVertical: 6,
        borderRadius: 7,
    },
    rowPressed: {
        backgroundColor: theme.colors.surfaceSelected,
    },
    rowSelected: {
        backgroundColor: theme.colors.surfaceSelected,
        borderWidth: 1,
        borderColor: theme.colors.textLink,
    },
    chevron: {
        width: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chevronGutter: {
        width: 14,
    },
    dirName: {
        flex: 1,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    fileName: {
        flex: 1,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default(),
    },
    loader: {
        marginLeft: 4,
    },
}));
