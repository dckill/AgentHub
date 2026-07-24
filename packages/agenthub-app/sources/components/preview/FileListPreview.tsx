import * as React from 'react';
import { Platform, View } from 'react-native';
import { Text } from '@/components/StyledText';
import Ionicons from '@expo/vector-icons/Ionicons';
import Octicons from '@expo/vector-icons/Octicons';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useFileListScale } from '@/hooks/useScale';
import { t } from '@/text';
import { getDirectoryTreeRowMetrics } from '@/components/directoryTreeMetrics';

export const FileListPreview = React.memo(() => {
    const { theme } = useUnistyles();
    const { s } = useFileListScale();
    const rowMetrics = getDirectoryTreeRowMetrics(s, Platform.OS !== 'web');
    const sampleFiles = [
        { icon: 'file-code' as const, name: 'components/DeviceList.tsx', status: t('files.modified'), tone: 'modified' },
        { icon: 'file-directory' as const, name: 'sources/settings', status: t('previewSamples.fileDirectory'), tone: 'folder' },
        { icon: 'file-media' as const, name: 'assets/icons/project.svg', status: t('files.added'), tone: 'added' },
    ];

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingHorizontal: s(16), paddingTop: s(12), paddingBottom: s(8) }]}>
                <Text style={[styles.headerTitle, { fontSize: s(13), lineHeight: s(18) }]}>{t('settingsAppearance.fileListScale')}</Text>
                <View style={[styles.countBadge, { paddingHorizontal: s(8), height: s(22), borderRadius: s(11) }]}>
                    <Text style={[styles.countText, { fontSize: s(12) }]}>3</Text>
                </View>
            </View>
            <View style={[styles.card, { marginHorizontal: s(12), borderRadius: s(12) }]}>
                {sampleFiles.map((file, index) => {
                    const statusColor = file.tone === 'added'
                        ? theme.colors.gitAddedText
                        : file.tone === 'modified'
                            ? theme.colors.syntaxFunction
                            : theme.colors.textSecondary;

                    return (
                        <View
                            key={file.name}
                            style={[
                                styles.row,
                                {
                                    minHeight: rowMetrics.rowMinHeight,
                                    paddingHorizontal: s(14),
                                    paddingVertical: s(9),
                                    borderBottomWidth: index === sampleFiles.length - 1 ? 0 : StyleSheet.hairlineWidth,
                                    borderBottomColor: theme.colors.divider,
                                },
                            ]}
                        >
                            <Octicons name={file.icon} size={rowMetrics.folderIconSize} color={statusColor} style={{ marginRight: s(10) }} />
                            <Text style={[styles.fileName, { fontSize: rowMetrics.fontSize, lineHeight: rowMetrics.lineHeight }]} numberOfLines={1}>
                                {file.name}
                            </Text>
                            <View style={[styles.statusPill, { paddingHorizontal: s(7), height: s(22), borderRadius: s(7), borderColor: statusColor }]}>
                                <Text style={[styles.statusText, { fontSize: s(11), color: statusColor }]} numberOfLines={1}>
                                    {file.status}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={s(15)} color={theme.colors.textSecondary} />
                        </View>
                    );
                })}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        paddingVertical: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        flex: 1,
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
        fontWeight: '600',
    },
    countBadge: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
    },
    countText: {
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    card: {
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    fileName: {
        flex: 1,
        minWidth: 0,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    statusPill: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        marginLeft: 8,
        marginRight: 6,
        backgroundColor: theme.colors.surfaceHigh,
    },
    statusText: {
        ...Typography.default('semiBold'),
        fontWeight: '600',
    },
}));
