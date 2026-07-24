import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSettingsScale } from '@/hooks/useScale';
import { getCurrentLanguage, getLanguageNativeName, t } from '@/text';

export const SettingsPreview = React.memo(() => {
    const { theme } = useUnistyles();
    const { s } = useSettingsScale();
    const sampleRows = [
        { icon: 'contrast-outline' as const, title: t('settingsAppearance.theme'), detail: t('settingsAppearance.themeDescriptions.adaptive') },
        { icon: 'language-outline' as const, title: t('settingsLanguage.title'), detail: getLanguageNativeName(getCurrentLanguage()) },
        { icon: 'key-outline' as const, title: t('settings.apiCredentials'), detail: t('previewSamples.credentialsSaved', { count: 2 }) },
    ];

    return (
        <View style={styles.container}>
            <View style={[styles.sectionHeader, { paddingHorizontal: s(16), paddingTop: s(12), paddingBottom: s(8) }]}>
                <Text style={[styles.sectionTitle, { fontSize: s(13), lineHeight: s(18), color: theme.colors.textSecondary }]}>
                    {t('previewSamples.settingsSection')}
                </Text>
            </View>
            <View style={[styles.card, { marginHorizontal: s(12), borderRadius: s(12) }]}>
                {sampleRows.map((row, index) => (
                    <View
                        key={row.title}
                        style={[
                            styles.row,
                            {
                                minHeight: s(56),
                                paddingHorizontal: s(14),
                                paddingVertical: s(10),
                                borderBottomWidth: index === sampleRows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                                borderBottomColor: theme.colors.divider,
                            },
                        ]}
                    >
                        <View style={[styles.iconBox, { width: s(32), height: s(32), borderRadius: s(8), marginRight: s(12), backgroundColor: theme.colors.surfaceHigh }]}>
                            <Ionicons name={row.icon} size={s(20)} color={theme.colors.accent} />
                        </View>
                        <Text style={[styles.title, { fontSize: s(16), lineHeight: s(22), color: theme.colors.text }]} numberOfLines={1}>
                            {row.title}
                        </Text>
                        <Text style={[styles.detail, { fontSize: s(14), lineHeight: s(20), color: theme.colors.textSecondary }]} numberOfLines={1}>
                            {row.detail}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.groupped.background,
        paddingVertical: 8,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionTitle: {
        ...Typography.default('semiBold'),
        fontWeight: '600',
    },
    card: {
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        ...Typography.default(),
        flex: 1,
        minWidth: 0,
    },
    detail: {
        ...Typography.default(),
        marginLeft: 12,
    },
}));
