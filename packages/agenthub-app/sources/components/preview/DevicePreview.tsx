import * as React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/StyledText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '@/constants/Typography';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useDeviceScale } from '@/hooks/useScale';
import { StatusDot } from '@/components/StatusDot';
import { t } from '@/text';

export const DevicePreview = React.memo(() => {
    const { theme } = useUnistyles();
    const { s } = useDeviceScale();
    const sampleDevices = [
        {
            name: t('previewSamples.developmentWorkstation'),
            detail: `macbook.local · macOS · ${t('status.online')}`,
            online: true,
        },
        {
            name: t('previewSamples.buildServer'),
            detail: `build-node · Linux · ${t('status.offline')}`,
            online: false,
        },
    ];

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingHorizontal: s(16), paddingTop: s(12), paddingBottom: s(8) }]}>
                <Text style={[styles.headerText, { fontSize: s(13), lineHeight: s(18), color: theme.colors.textSecondary }]}>
                    {t('previewSamples.favoriteDevices', { count: sampleDevices.length })}
                </Text>
            </View>
            <View style={[styles.card, { marginHorizontal: s(12), borderRadius: s(12) }]}>
                {sampleDevices.map((device, index) => (
                    <View
                        key={device.name}
                        style={[
                            styles.row,
                            {
                                minHeight: s(58),
                                paddingHorizontal: s(14),
                                paddingVertical: s(10),
                                borderBottomWidth: index === sampleDevices.length - 1 ? 0 : StyleSheet.hairlineWidth,
                                borderBottomColor: theme.colors.divider,
                            },
                        ]}
                    >
                        <Ionicons
                            name="desktop-outline"
                            size={s(24)}
                            color={device.online ? theme.colors.status.connected : theme.colors.status.disconnected}
                            style={{ marginRight: s(12) }}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.title, { fontSize: s(16), lineHeight: s(22), color: theme.colors.text }]} numberOfLines={1}>
                                {device.name}
                            </Text>
                            <Text style={[styles.subtitle, { fontSize: s(13), lineHeight: s(18), color: theme.colors.textSecondary }]} numberOfLines={1}>
                                {device.detail}
                            </Text>
                        </View>
                        <StatusDot
                            color={device.online ? theme.colors.status.connected : theme.colors.status.disconnected}
                            isPulsing={device.online}
                        />
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerText: {
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
    title: {
        ...Typography.default('semiBold'),
    },
    subtitle: {
        ...Typography.default(),
    },
}));
