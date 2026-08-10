import * as React from 'react';
import { View, Text, Pressable, FlatList, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { SessionRowData } from '@/sync/storage';
import { formatLastSeen } from '@/utils/sessionUtils';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { ProjectIcon } from '@/components/ProjectIcon';

interface ArchivedSessionsOverlayProps {
    visible: boolean;
    onClose: () => void;
    projectIcon: string;
    projectName: string;
    archivedSessions: SessionRowData[];
}

export const ArchivedSessionsOverlay = React.memo(({ visible, onClose, projectIcon, projectName, archivedSessions }: ArchivedSessionsOverlayProps) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const navigateToSession = useNavigateToSession();

    const handleSessionPress = React.useCallback((sessionId: string) => {
        navigateToSession(sessionId);
    }, [navigateToSession]);

    const renderItem = React.useCallback(({ item }: { item: SessionRowData }) => (
        <Pressable
            style={styles.sessionRow}
            onPress={() => handleSessionPress(item.id)}
            accessibilityRole="button"
            accessibilityLabel={item.name}
        >
            <ProjectIcon icon={projectIcon} size={20} />
            <View style={styles.sessionContent}>
                <Text style={styles.sessionName} numberOfLines={1}>
                    {item.name}
                </Text>
                <Text style={styles.sessionTime} numberOfLines={1}>
                    {formatLastSeen(item.activeAt ?? item.createdAt ?? 0, false)}
                </Text>
            </View>
        </Pressable>
    ), [projectIcon, handleSessionPress]);

    if (!visible) return null;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Pressable
                    onPress={onClose}
                    hitSlop={12}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                >
                    <Text style={styles.backButtonText}>{t('common.back')}</Text>
                </Pressable>
                <Text style={styles.headerTitle} numberOfLines={1}>
                    {projectName}
                </Text>
                <View style={{ width: 48 }} />
            </View>

            {/* Content */}
            {archivedSessions.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>{t('project.noArchivedSessions')}</Text>
                </View>
            ) : (
                <FlatList
                    data={archivedSessions}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                />
            )}
        </View>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.select({ ios: 56, default: 48 }),
        paddingBottom: 12,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    backButton: {
        paddingVertical: 4,
    },
    backButtonText: {
        fontSize: 16,
        color: theme.colors.textLink,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.text,
        flex: 1,
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
    sessionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    sessionContent: {
        flex: 1,
    },
    sessionName: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default('regular'),
    },
    sessionTime: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    listContent: {
        paddingTop: 8,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontSize: 15,
        color: theme.colors.textSecondary,
    },
}));
