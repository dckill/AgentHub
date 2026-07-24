import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import type { MachineTransferBadge } from '@/utils/fileTransfers';

interface FileTransferBadgeProps {
    badge: MachineTransferBadge | null;
    onPress?: (event: any) => void;
    compact?: boolean;
}

const stylesheet = StyleSheet.create((theme) => ({
    badge: {
        minWidth: 38,
        height: 26,
        paddingHorizontal: 8,
        borderRadius: 7,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactBadge: {
        minWidth: 24,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 9,
    },
    text: {
        fontSize: 12,
        lineHeight: 16,
        ...Typography.default('semiBold'),
    },
    compactText: {
        fontSize: 10,
        lineHeight: 12,
    },
}));

function getToneColors(theme: any, tone: MachineTransferBadge['tone']) {
    switch (tone) {
        case 'error':
            return {
                background: `${theme.colors.status.error}1F`,
                border: `${theme.colors.status.error}66`,
                text: theme.colors.status.error,
            };
        case 'active':
            return {
                background: `${theme.colors.textLink}1F`,
                border: `${theme.colors.textLink}66`,
                text: theme.colors.textLink,
            };
        case 'paused':
            return {
                background: `${theme.colors.textSecondary}18`,
                border: `${theme.colors.textSecondary}44`,
                text: theme.colors.textSecondary,
            };
        case 'done':
            return {
                background: `${theme.colors.success}1F`,
                border: `${theme.colors.success}55`,
                text: theme.colors.success,
            };
    }
}

export function FileTransferBadge({ badge, onPress, compact = false }: FileTransferBadgeProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;

    if (!badge) {
        return null;
    }

    const colors = getToneColors(theme, badge.tone);
    const content = (
        <View
            style={[
                styles.badge,
                compact && styles.compactBadge,
                { backgroundColor: colors.background, borderColor: colors.border },
            ]}
        >
            <Text
                style={[
                    styles.text,
                    compact && styles.compactText,
                    { color: colors.text },
                ]}
                numberOfLines={1}
            >
                {badge.label}
            </Text>
        </View>
    );

    if (!onPress) {
        return content;
    }

    return (
        <Pressable
            accessibilityLabel={badge.accessibilityLabel}
            accessibilityRole="button"
            hitSlop={8}
            onPress={(event) => {
                event.stopPropagation?.();
                onPress(event);
            }}
        >
            {content}
        </Pressable>
    );
}

interface TransferHeaderIconProps {
    failedCount: number;
    activeCount: number;
    accessibilityLabel: string;
    onPress: (event: any) => void;
}

export function TransferHeaderIcon({ failedCount, activeCount, accessibilityLabel, onPress }: TransferHeaderIconProps) {
    const { theme } = useUnistyles();
    const count = failedCount > 0 ? failedCount : activeCount;
    const tone = failedCount > 0 ? 'error' : 'active';
    const colors = count > 0 ? getToneColors(theme, tone) : null;

    return (
        <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            onPress={onPress}
            hitSlop={15}
            style={headerStyles.button}
        >
            <Ionicons name="cloud-download-outline" size={23} color={theme.colors.header.tint} />
            {count > 0 && colors && (
                <View style={[headerStyles.dot, { backgroundColor: colors.text }]}>
                    <Text style={headerStyles.dotText} numberOfLines={1}>
                        {count > 9 ? '9+' : String(count)}
                    </Text>
                </View>
            )}
        </Pressable>
    );
}

const headerStyles = StyleSheet.create(() => ({
    button: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    dot: {
        position: 'absolute',
        top: 3,
        right: 1,
        minWidth: 15,
        height: 15,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
    },
    dotText: {
        color: 'white',
        fontSize: 9,
        lineHeight: 11,
        ...Typography.default('semiBold'),
    },
}));
