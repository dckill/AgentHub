import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useChatScale } from '@/hooks/useScale';
import { StatusDot } from '@/components/StatusDot';
import { GlassSurface, StatusChip } from '@/components/glass';
import { getChatHeaderVisuals, getChatShellVisuals } from '@/components/chatShellVisuals';
import { t } from '@/text';

export const ChatPreview = React.memo(() => {
    const { theme } = useUnistyles();
    const { s } = useChatScale();
    const shellVisuals = getChatShellVisuals(theme);
    const headerVisuals = getChatHeaderVisuals(theme);

    return (
        <View style={[styles.container, { backgroundColor: shellVisuals.backgroundColor }]}>
            <GlassSurface
                tone="raised"
                style={[
                    styles.previewHeader,
                    {
                        backgroundColor: headerVisuals.backgroundColor,
                        borderColor: headerVisuals.borderColor,
                        shadowColor: headerVisuals.shadowColor,
                    },
                ]}
            >
                <View style={styles.previewHeaderText}>
                    <Text style={[styles.previewTitle, { color: headerVisuals.tintColor }, Typography.default('semiBold')]} numberOfLines={1}>
                        {t('previewSamples.chatWorkspaceTitle')}
                    </Text>
                    <Text style={[styles.previewSubtitle, { color: headerVisuals.mutedColor }, Typography.default()]} numberOfLines={1}>
                        {t('previewSamples.chatWorkspaceSubtitle')}
                    </Text>
                </View>
                <StatusChip label={t('status.online')} tone="active" />
            </GlassSurface>

            {/* User message */}
            <View style={{
                flexDirection: 'column',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                paddingHorizontal: s(16),
            }}>
                <View style={{
                    backgroundColor: theme.colors.userMessageBackground,
                    paddingHorizontal: s(12),
                    paddingVertical: s(4),
                    borderRadius: s(12),
                    marginBottom: s(12),
                    maxWidth: '100%',
                }}>
                    <Text style={{
                        ...Typography.default('regular'),
                        fontSize: s(16),
                        lineHeight: s(24),
                        color: theme.colors.userMessageText,
                    }}>
                        {t('previewSamples.chatUserPrompt')}
                    </Text>
                </View>
            </View>

            {/* Agent text reply */}
            <View style={{
                marginHorizontal: s(16),
                marginBottom: s(12),
            }}>
                <Text style={{
                    ...Typography.default('regular'),
                    fontSize: s(16),
                    lineHeight: s(24),
                    color: theme.colors.text,
                }}>
                    {t('previewSamples.chatAgentReview')}
                </Text>
            </View>

            {/* Tool call card */}
            <GlassSurface tone="raised" style={{
                marginHorizontal: s(8),
                marginBottom: s(12),
                borderRadius: s(12),
            }}>
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: s(12),
                    paddingVertical: s(8),
                }}>
                    <Ionicons name="create-outline" size={s(18)} color={theme.colors.textSecondary} />
                    <View style={{ flex: 1, marginLeft: s(8) }}>
                        <Text style={{
                            fontSize: s(14),
                            ...Typography.default('semiBold'),
                            color: theme.colors.text,
                        }}>
                            {t('previewSamples.chatEdit')}
                        </Text>
                        <Text style={{
                            fontSize: s(12),
                            color: theme.colors.textSecondary,
                            ...Typography.mono(),
                        }} numberOfLines={1}>
                            src/auth/middleware.ts
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <StatusDot color={theme.colors.accent} isPulsing={true} />
                        <Text style={{
                            fontSize: s(12),
                            color: theme.colors.textSecondary,
                            marginLeft: s(6),
                        }}>2s</Text>
                    </View>
                </View>
            </GlassSurface>

            {/* Agent event */}
            <View style={{
                marginHorizontal: s(8),
                alignItems: 'center',
                paddingVertical: s(8),
            }}>
                <Text style={{
                    color: theme.colors.agentEventText,
                    fontSize: s(14),
                }}>
                    {t('previewSamples.chatPlanMode')}
                </Text>
            </View>

            {/* Another agent reply */}
            <View style={{
                marginHorizontal: s(16),
                marginBottom: s(12),
            }}>
                <Text style={{
                    ...Typography.default('semiBold'),
                    fontSize: s(16),
                    lineHeight: s(24),
                    color: theme.colors.text,
                }}>
                    {t('previewSamples.chatAnalysisComplete')}
                </Text>
                <Text style={{
                    ...Typography.default('regular'),
                    fontSize: s(16),
                    lineHeight: s(24),
                    color: theme.colors.text,
                }}>
                    {t('previewSamples.chatRecommendation')}
                </Text>
            </View>

            {/* Code block */}
            <GlassSurface tone="raised" style={{
                marginHorizontal: s(16),
                marginBottom: s(12),
                borderRadius: s(8),
            }}>
                <View style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(4),
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.colors.divider,
                }}>
                    <Text style={{
                        ...Typography.mono(),
                        fontSize: s(12),
                        color: theme.colors.textSecondary,
                    }}>
                        typescript
                    </Text>
                </View>
                <View style={{ padding: s(12) }}>
                    <Text style={{
                        ...Typography.mono(),
                        fontSize: s(14),
                        lineHeight: s(20),
                        color: theme.colors.text,
                    }}>
                        <Text style={{ color: theme.colors.syntaxKeyword }}>const{' '}</Text>
                        <Text style={{ color: theme.colors.syntaxFunction }}>refreshToken{' '}</Text>
                        <Text style={{ color: theme.colors.syntaxDefault }}>={' '}</Text>
                        <Text style={{ color: theme.colors.syntaxKeyword }}>await{' '}</Text>
                        <Text style={{ color: theme.colors.syntaxFunction }}>verify</Text>
                        <Text style={{ color: theme.colors.syntaxDefault }}>();</Text>
                    </Text>
                </View>
            </GlassSurface>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingVertical: 8,
    },
    previewHeader: {
        marginHorizontal: 8,
        marginBottom: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    previewHeaderText: {
        flex: 1,
        minWidth: 0,
    },
    previewTitle: {
        fontSize: 15,
        lineHeight: 20,
    },
    previewSubtitle: {
        fontSize: 12,
        lineHeight: 16,
    },
}));
