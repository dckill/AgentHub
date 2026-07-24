import * as React from 'react';
import { Modal as RNModal, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { ProjectIcon } from '@/components/ProjectIcon';
import type { ProjectGroupData } from '@/sync/storage';
import { buildProjectDetailRows } from '@/components/projectDetailsRows';
import { t } from '@/text';

interface ProjectDetailsSheetProps {
    visible: boolean;
    onClose: () => void;
    project: ProjectGroupData;
}

function DetailRow(props: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
    const { theme } = useUnistyles();
    return (
        <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
                <Ionicons name={props.icon} size={18} color={theme.colors.textSecondary} />
            </View>
            <View style={styles.detailText}>
                <Text style={styles.detailLabel}>{props.label}</Text>
                <Text style={styles.detailValue} selectable>{props.value}</Text>
            </View>
        </View>
    );
}

export const ProjectDetailsSheet = React.memo(function ProjectDetailsSheet(props: ProjectDetailsSheetProps) {
    const { visible, onClose, project } = props;
    const { theme } = useUnistyles();

    const detailRows = buildProjectDetailRows(project, {
        machine: t('project.machine'),
        path: t('project.path'),
        projectKey: t('project.projectKey'),
        status: t('project.status'),
        visible: t('project.visible'),
        hidden: t('project.hidden'),
        branch: t('project.branch'),
        worktree: t('project.worktree'),
        activeSessionCount: t('project.activeSessionCount'),
        archivedSessionCount: t('project.archivedSessionCount'),
        computerSessionCount: t('project.computerSessionCount'),
        gitChanges: t('project.gitChanges'),
        noGitChanges: t('project.noGitChanges'),
        notAvailable: t('project.notAvailable'),
        enabled: t('project.enabled'),
    });

    return (
        <RNModal
            animationType="fade"
            onRequestClose={onClose}
            transparent
            visible={visible}
        >
            <View style={styles.backdrop}>
                <Pressable
                    accessibilityLabel={t('common.close')}
                    accessibilityRole="button"
                    style={styles.backdropDismiss}
                    onPress={onClose}
                />
                <View
                    accessibilityLabel={t('project.detailsTitle')}
                    accessibilityViewIsModal
                    aria-modal
                    role="dialog"
                    style={styles.sheet}
                >
                    <View style={styles.header}>
                        <ProjectIcon icon={project.icon} size={52} />
                        <View style={styles.headerText}>
                            <Text style={styles.title} numberOfLines={1}>{project.displayName}</Text>
                            <Text style={styles.subtitle} numberOfLines={1}>{project.displayPath}</Text>
                        </View>
                        <Pressable
                            accessibilityLabel={t('common.close')}
                            accessibilityRole="button"
                            onPress={onClose}
                            hitSlop={12}
                            style={styles.closeButton}
                        >
                            <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                        {detailRows.map((row) => (
                            <DetailRow
                                key={row.id}
                                icon={row.icon as keyof typeof Ionicons.glyphMap}
                                label={row.label}
                                value={row.value}
                            />
                        ))}
                    </ScrollView>
                </View>
            </View>
        </RNModal>
    );
});

const styles = StyleSheet.create((theme) => ({
    backdrop: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        backgroundColor: 'rgba(0,0,0,0.52)',
    },
    backdropDismiss: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    sheet: {
        width: '100%',
        maxWidth: 480,
        maxHeight: '82%',
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.colors.borderStrong,
        shadowColor: theme.colors.shadow.color,
        shadowOpacity: theme.dark ? 0.55 : 0.28,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 16 },
        elevation: 22,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 18,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.borderStrong,
        backgroundColor: theme.colors.header.background,
    },
    headerText: {
        flex: 1,
        minWidth: 0,
        marginLeft: 12,
    },
    title: {
        color: theme.colors.text,
        fontSize: 18,
        lineHeight: 24,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        ...Typography.default(),
    },
    closeButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: theme.colors.surfaceHover,
    },
    content: {
        paddingVertical: 6,
        backgroundColor: theme.colors.surface,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    detailIcon: {
        width: 26,
        height: 26,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.accentSoft,
    },
    detailText: {
        flex: 1,
        minWidth: 0,
    },
    detailLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        marginBottom: 2,
        ...Typography.default('semiBold'),
    },
    detailValue: {
        color: theme.colors.text,
        fontSize: 15,
        lineHeight: 20,
        ...Typography.default(),
    },
}));
