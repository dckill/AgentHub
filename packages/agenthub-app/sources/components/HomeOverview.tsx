import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import {
    useAllMachines,
    useAllSessions,
    useProjectListViewData,
    useSocketStatus,
} from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { resolveSessionDisplayTitle } from '@/utils/sessionTitle';
import { t } from '@/text';
import { buildHomeOverviewModel } from './homeOverviewModel';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    content: {
        width: '100%',
        maxWidth: 920,
        alignSelf: 'center',
        paddingHorizontal: 40,
        paddingTop: 48,
        paddingBottom: 48,
        gap: 24,
    },
    eyebrow: {
        color: theme.dark ? theme.colors.status.connected : theme.colors.diff.inlineAddedText,
        fontSize: 12,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
        ...Typography.default('semiBold'),
    },
    title: {
        color: theme.colors.text,
        fontSize: 34,
        lineHeight: 40,
        marginTop: 8,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        color: theme.colors.textSecondary,
        fontSize: 16,
        lineHeight: 24,
        marginTop: 10,
        maxWidth: 620,
        ...Typography.default(),
    },
    primaryButton: {
        alignSelf: 'flex-start',
        minHeight: 44,
        marginTop: 24,
        paddingHorizontal: 20,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        backgroundColor: theme.colors.button.primary.background,
    },
    primaryButtonPressed: {
        opacity: 0.82,
    },
    primaryButtonDisabled: {
        opacity: 0.45,
    },
    primaryButtonText: {
        color: theme.colors.button.primary.tint,
        fontSize: 15,
        ...Typography.default('semiBold'),
    },
    grid: {
        flexDirection: 'row',
        gap: 20,
        alignItems: 'stretch',
    },
    panel: {
        flex: 1,
        minWidth: 0,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.divider,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceHigh,
        padding: 20,
    },
    panelTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginBottom: 16,
    },
    panelTitle: {
        color: theme.colors.text,
        fontSize: 15,
        ...Typography.default('semiBold'),
    },
    healthValue: {
        color: theme.colors.text,
        fontSize: 28,
        lineHeight: 34,
        ...Typography.default('semiBold'),
    },
    healthDescription: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 21,
        marginTop: 8,
        ...Typography.default(),
    },
    statusRegion: {
        marginTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
        paddingTop: 16,
    },
    statusTitle: {
        color: theme.colors.text,
        fontSize: 14,
        ...Typography.default('semiBold'),
    },
    statusDescription: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 5,
        ...Typography.default(),
    },
    secondaryAction: {
        minHeight: 44,
        marginTop: 12,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    secondaryActionText: {
        color: theme.dark ? theme.colors.status.connected : theme.colors.diff.inlineAddedText,
        fontSize: 14,
        ...Typography.default('semiBold'),
    },
    recentList: {
        gap: 4,
    },
    recentItem: {
        minHeight: 56,
        borderRadius: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    recentItemPressed: {
        backgroundColor: theme.colors.surfaceHighest,
    },
    recentText: {
        flex: 1,
        minWidth: 0,
    },
    recentTitle: {
        color: theme.colors.text,
        fontSize: 14,
        ...Typography.default('semiBold'),
    },
    recentMeta: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginTop: 3,
        ...Typography.default(),
    },
    emptyRecent: {
        minHeight: 116,
        justifyContent: 'center',
    },
    emptyRecentTitle: {
        color: theme.colors.text,
        fontSize: 14,
        ...Typography.default('semiBold'),
    },
    emptyRecentDescription: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 6,
        ...Typography.default(),
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        ...Typography.default(),
    },
}));

export function HomeOverview() {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const router = useRouter();
    const navigateToSession = useNavigateToSession();
    const projectList = useProjectListViewData();
    const machines = useAllMachines({ includeOffline: true });
    const sessions = useAllSessions();
    const socketStatus = useSocketStatus();

    const model = React.useMemo(() => buildHomeOverviewModel({
        dataReady: projectList !== null,
        socketStatus: socketStatus.status,
        machines: machines.map((machine) => ({
            id: machine.id,
            online: isMachineOnline(machine),
        })),
        sessions: sessions.map((session) => ({
            id: session.id,
            updatedAt: session.updatedAt,
            active: session.active,
            title: resolveSessionDisplayTitle(session.metadata),
        })),
    }), [machines, projectList, sessions, socketStatus.status]);

    const newSessionLabel = t('newSession.title');

    if (model.state === 'loading') {
        return (
            <View
                role="status"
                accessibilityLiveRegion="polite"
                accessibilityLabel={t('homeOverview.loading')}
                style={styles.loading}
            >
                <ActivityIndicator color={theme.colors.textSecondary} />
                <Text style={styles.loadingText}>{t('homeOverview.loading')}</Text>
            </View>
        );
    }

    const healthStatus = (() => {
        if (model.state === 'offline') {
            return {
                title: t('homeOverview.connectionInterrupted'),
                description: t('homeOverview.connectionInterruptedDescription'),
                icon: 'cloud-offline-outline' as const,
                action: t('homeOverview.connectionSettings'),
                onPress: () => router.push('/server'),
            };
        }
        if (model.state === 'connecting') {
            return {
                title: t('homeOverview.restoringConnection'),
                description: t('homeOverview.restoringConnectionDescription'),
                icon: 'sync-outline' as const,
                action: null,
                onPress: null,
            };
        }
        if (model.state === 'empty') {
            return {
                title: t('homeOverview.noDevices'),
                description: t('homeOverview.noDevicesDescription'),
                icon: 'desktop-outline' as const,
                action: t('homeOverview.viewDevices'),
                onPress: () => router.push('/machines'),
            };
        }
        if (model.state === 'no-online-devices') {
            return {
                title: t('homeOverview.noOnlineDevices'),
                description: t('homeOverview.noOnlineDevicesDescription'),
                icon: 'power-outline' as const,
                action: t('homeOverview.viewDevices'),
                onPress: () => router.push('/machines'),
            };
        }
        return {
            title: t('homeOverview.workspaceHealthy'),
            description: t('homeOverview.workspaceHealthyDescription'),
            icon: 'checkmark-circle-outline' as const,
            action: t('homeOverview.viewDevices'),
            onPress: () => router.push('/machines'),
        };
    })();

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View>
                <Text style={styles.eyebrow}>{t('homeOverview.eyebrow')}</Text>
                <Text accessibilityRole="header" style={styles.title}>{t('homeOverview.title')}</Text>
                <Text style={styles.subtitle}>{t('homeOverview.subtitle')}</Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={newSessionLabel}
                    accessibilityState={{ disabled: !model.canStartSession }}
                    disabled={!model.canStartSession}
                    onPress={() => router.navigate('/new')}
                    style={({ pressed }) => [
                        styles.primaryButton,
                        pressed && styles.primaryButtonPressed,
                        !model.canStartSession && styles.primaryButtonDisabled,
                    ]}
                >
                    <Ionicons name="add" size={18} color={theme.colors.button.primary.tint} />
                    <Text style={styles.primaryButtonText}>{newSessionLabel}</Text>
                </Pressable>
            </View>

            <View style={styles.grid}>
                <View style={styles.panel}>
                    <View style={styles.panelTitleRow}>
                        <Ionicons name="pulse-outline" size={18} color={theme.colors.status.connected} />
                        <Text style={styles.panelTitle}>{t('homeOverview.deviceHealth')}</Text>
                    </View>
                    <Text style={styles.healthValue}>
                        {t('homeOverview.devicesOnline', {
                            online: model.onlineMachineCount,
                            total: model.totalMachineCount,
                        })}
                    </Text>
                    <Text style={styles.healthDescription}>{t('homeOverview.deviceHealthDescription')}</Text>
                    <View
                        role="status"
                        accessibilityLiveRegion="polite"
                        accessibilityLabel={`${healthStatus.title}. ${healthStatus.description}`}
                        style={styles.statusRegion}
                    >
                        <View style={styles.panelTitleRow}>
                            <Ionicons name={healthStatus.icon} size={17} color={theme.colors.textSecondary} />
                            <Text style={styles.statusTitle}>{healthStatus.title}</Text>
                        </View>
                        <Text style={styles.statusDescription}>{healthStatus.description}</Text>
                        {healthStatus.action && healthStatus.onPress && (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={healthStatus.action}
                                onPress={healthStatus.onPress}
                                style={styles.secondaryAction}
                            >
                                <Text style={styles.secondaryActionText}>{healthStatus.action}</Text>
                                <Ionicons name="chevron-forward" size={15} color={theme.colors.status.connected} />
                            </Pressable>
                        )}
                    </View>
                </View>

                <View style={styles.panel}>
                    <View style={styles.panelTitleRow}>
                        <Ionicons name="time-outline" size={18} color={theme.colors.status.connected} />
                        <Text style={styles.panelTitle}>{t('homeOverview.recentWork')}</Text>
                    </View>
                    {model.recentWork.length === 0 ? (
                        <View style={styles.emptyRecent}>
                            <Text style={styles.emptyRecentTitle}>{t('homeOverview.noRecentWork')}</Text>
                            <Text style={styles.emptyRecentDescription}>{t('homeOverview.noRecentWorkDescription')}</Text>
                        </View>
                    ) : (
                        <View style={styles.recentList}>
                            {model.recentWork.map((session) => {
                                const title = session.title ?? t('homeOverview.sessionFallback');
                                const stateLabel = t(session.active ? 'homeOverview.active' : 'homeOverview.inactive');
                                return (
                                    <Pressable
                                        key={session.id}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${title}, ${stateLabel}`}
                                        onPress={() => navigateToSession(session.id)}
                                        style={({ pressed }) => [
                                            styles.recentItem,
                                            pressed && styles.recentItemPressed,
                                        ]}
                                    >
                                        <Ionicons
                                            name={session.active ? 'radio-button-on-outline' : 'archive-outline'}
                                            size={17}
                                            color={session.active ? theme.colors.status.connected : theme.colors.textSecondary}
                                        />
                                        <View style={styles.recentText}>
                                            <Text numberOfLines={1} style={styles.recentTitle}>{title}</Text>
                                            <Text style={styles.recentMeta}>{stateLabel}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}
