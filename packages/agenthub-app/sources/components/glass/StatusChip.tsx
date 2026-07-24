import * as React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { getStatusChipColors, type StatusChipTone } from './glassStyles';

export interface StatusChipProps {
    label: string;
    tone?: StatusChipTone;
    style?: StyleProp<ViewStyle>;
}

const stylesheet = StyleSheet.create((theme) => ({
    chip: {
        minHeight: 20,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: theme.borderRadius.xxl,
        paddingHorizontal: 8,
        paddingVertical: 2,
        gap: 4,
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 999,
    },
    label: {
        ...Typography.default('semiBold'),
        fontSize: 10,
        lineHeight: 12,
        includeFontPadding: false,
    },
}));

export function StatusChip(props: StatusChipProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const { label, tone = 'info', style } = props;
    const colors = getStatusChipColors(theme, tone);

    return (
        <View
            accessibilityRole="text"
            style={[
                styles.chip,
                {
                    backgroundColor: colors.backgroundColor,
                    borderColor: colors.borderColor,
                },
                style,
            ]}
        >
            <View style={[styles.dot, { backgroundColor: colors.dotColor }]} />
            <Text style={[styles.label, { color: colors.textColor }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}
