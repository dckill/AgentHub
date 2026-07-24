import * as React from 'react';
import { View, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { StatusDot } from '@/components/StatusDot';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSessionListScale } from '@/hooks/useScale';
import { ProjectIcon } from '@/components/ProjectIcon';
import { GlassSurface, StatusChip } from '@/components/glass';
import { getProjectCardVisuals, getSessionRowVisuals, getSessionStateChip } from '@/components/sessionListVisuals';
import { t } from '@/text';

const STATUS_CONFIG: Record<string, { dotColor: string; isPulsing: boolean; isConnected: boolean }> = {
    disconnected: { dotColor: '#999', isPulsing: false, isConnected: false },
    thinking: { dotColor: '#FFB22E', isPulsing: true, isConnected: true },
    waiting: { dotColor: '#34C759', isPulsing: false, isConnected: true },
    permission_required: { dotColor: '#FF9500', isPulsing: true, isConnected: true },
};

export const SessionListPreview = React.memo(() => {
    const { theme } = useUnistyles();
    const { s } = useSessionListScale();
    const mockProjects = [
        {
            icon: 'icon:mobile',
            name: t('previewSamples.sessionMobileClient'),
            path: '~/projects/mobile-client',
            branch: 'main',
            sessions: [
                { name: t('previewSamples.sessionFixAuth'), state: 'waiting' as const },
                { name: t('previewSamples.sessionProfile'), state: 'thinking' as const },
                { name: t('previewSamples.sessionCache'), state: 'disconnected' as const },
            ],
        },
        {
            icon: 'icon:api',
            name: t('previewSamples.sessionApiService'),
            path: '~/work/api-server',
            branch: 'feature/auth',
            sessions: [
                { name: t('previewSamples.sessionTokenRefresh'), state: 'permission_required' as const },
                { name: t('previewSamples.sessionRateLimit'), state: 'waiting' as const },
                { name: t('previewSamples.sessionApiDocs'), state: 'disconnected' as const },
                { name: t('previewSamples.sessionCors'), state: 'disconnected' as const },
            ],
        },
    ];

    return (
        <View style={styles.container}>
            {mockProjects.map((project) => (
                <View key={project.name}>
                    {/* Section Header */}
                    <View style={{
                        paddingTop: s(12),
                        paddingBottom: Platform.select({ ios: s(6), default: s(8) }),
                        paddingHorizontal: Platform.select({ ios: s(32), default: s(24) }),
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                    }}>
                        <View style={{ marginRight: s(10), marginTop: -s(4) }}>
                            <ProjectIcon icon={project.icon} size={s(48)} />
                        </View>
                        <View style={{ flex: 1, justifyContent: 'center', minWidth: 0 }}>
                            <Text style={{
                                ...Typography.default('semiBold'),
                                color: theme.colors.text,
                                fontSize: s(15),
                                lineHeight: s(20),
                            }} numberOfLines={1}>
                                {project.name}
                            </Text>
                            <Text style={{
                                ...Typography.default('regular'),
                                color: theme.colors.groupped.sectionTitle,
                                fontSize: s(12),
                                lineHeight: s(16),
                            }} numberOfLines={1}>
                                {project.path}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                                <Ionicons
                                    name="git-branch-outline"
                                    size={s(11)}
                                    color={theme.colors.textSecondary}
                                    style={{ marginRight: 3 }}
                                />
                                <Text style={{
                                    fontSize: s(11),
                                    color: theme.colors.textSecondary,
                                    ...Typography.default('regular'),
                                }} numberOfLines={1}>
                                    {project.branch}
                                </Text>
                                <Text style={{
                                    fontSize: s(11),
                                    fontWeight: '600',
                                    color: theme.colors.textSecondary,
                                    marginLeft: s(6),
                                }}>+12</Text>
                                <Text style={{
                                    fontSize: s(11),
                                    fontWeight: '600',
                                    color: theme.colors.gitRemovedText,
                                    marginLeft: 3,
                                }}>-3</Text>
                            </View>
                        </View>
                    </View>

                    {/* Project Card */}
                    <GlassSurface
                        tone="raised"
                        style={{
                            ...getProjectCardVisuals(theme),
                            marginBottom: s(8),
                            marginHorizontal: Platform.select({ ios: s(16), default: s(12) }),
                            borderRadius: Platform.select({ ios: s(10), default: s(16) }),
                            overflow: 'hidden',
                        }}
                    >
                        {project.sessions.map((session, index) => {
                            const status = STATUS_CONFIG[session.state];
                            const dotColor = session.state === 'thinking' ? theme.colors.accent : status.dotColor;
                            const showBorder = index < project.sessions.length - 1;
                            const rowVisuals = getSessionRowVisuals(theme, false);
                            const stateLabel = session.state === 'thinking'
                                ? t('sessionInfo.thinking')
                                : session.state === 'permission_required'
                                    ? t('status.permissionRequired')
                                    : session.state === 'waiting'
                                        ? t('status.connected')
                                        : t('status.offline');
                            const stateChip = getSessionStateChip(session.state, stateLabel);
                            return (
                                <View
                                    key={session.name}
                                    style={{
                                        height: s(56),
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        paddingHorizontal: s(16),
                                        backgroundColor: rowVisuals.backgroundColor,
                                        borderBottomWidth: showBorder ? StyleSheet.hairlineWidth : 0,
                                        borderBottomColor: rowVisuals.borderColor,
                                    }}
                                >
                                    <View style={{ flex: 1, justifyContent: 'center', flexDirection: 'row', alignItems: 'center' }}>
                                        {status.isConnected && (
                                            <View style={{
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: s(16),
                                                height: s(16),
                                                marginRight: s(8),
                                            }}>
                                                <StatusDot color={dotColor} isPulsing={status.isPulsing} />
                                            </View>
                                        )}
                                        <Text
                                            style={{
                                                fontSize: s(15),
                                                flex: 1,
                                                ...Typography.default('regular'),
                                                color: status.isConnected ? theme.colors.text : theme.colors.textSecondary,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {session.name}
                                        </Text>
                                    </View>
                                    <StatusChip
                                        label={stateChip.label}
                                        tone={stateChip.tone}
                                        style={{ height: s(24), paddingHorizontal: s(7), marginLeft: s(8) }}
                                    />
                                </View>
                            );
                        })}
                    </GlassSurface>
                </View>
            ))}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        paddingTop: 8,
    },
}));
