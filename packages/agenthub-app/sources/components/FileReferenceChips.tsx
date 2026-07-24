import * as React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet } from 'react-native-unistyles';
import { hapticsLight } from './haptics';

interface FileReferenceChipsProps {
    paths: string[];
    onRemovePath: (path: string) => void;
}

function isFolder(path: string): boolean {
    return path.endsWith('/');
}

function getFileName(path: string): string {
    const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
    const parts = trimmed.split('/');
    return parts[parts.length - 1] || path;
}

function getParentPath(path: string): string {
    const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
    const parts = trimmed.split('/');
    parts.pop();
    const parent = parts.join('/');
    return parent ? parent + '/' : '';
}

export const FileReferenceChips = React.memo(function FileReferenceChips(props: FileReferenceChipsProps) {
    const { paths, onRemovePath } = props;

    if (paths.length === 0) {
        return null;
    }

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.container}
            contentContainerStyle={styles.content}
        >
            {paths.map((path) => {
                const folder = isFolder(path);
                const name = getFileName(path);
                const parent = getParentPath(path);
                return (
                    <View key={path} style={styles.chip}>
                        <Ionicons
                            name={folder ? 'folder' : 'document-text'}
                            size={14}
                            style={styles.chipIcon}
                        />
                        <Text style={styles.chipName} numberOfLines={1}>
                            {name}
                        </Text>
                        {parent !== '' && (
                            <Text style={styles.chipPath} numberOfLines={1}>
                                {parent}
                            </Text>
                        )}
                        <Pressable
                            onPress={() => {
                                hapticsLight();
                                onRemovePath(path);
                            }}
                            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                            style={(p) => [styles.removeButton, p.pressed && styles.removeButtonPressed]}
                        >
                            <Ionicons name="close" size={12} style={styles.removeIcon} />
                        </Pressable>
                    </View>
                );
            })}
        </ScrollView>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        maxHeight: 36,
    },
    content: {
        gap: 6,
        paddingVertical: 2,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 16,
        paddingLeft: 8,
        paddingRight: 4,
        paddingVertical: 4,
        gap: 4,
        height: 28,
    },
    chipIcon: {
        color: theme.colors.textSecondary,
    },
    chipName: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text,
    },
    chipPath: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        maxWidth: 80,
    },
    removeButton: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: theme.colors.surfacePressed,
        alignItems: 'center',
        justifyContent: 'center',
    },
    removeButtonPressed: {
        opacity: 0.7,
    },
    removeIcon: {
        color: theme.colors.textSecondary,
    },
}));
