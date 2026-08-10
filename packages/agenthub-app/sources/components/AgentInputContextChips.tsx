import Ionicons from '@expo/vector-icons/Ionicons';
import * as React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { getComposerSupplementalSurfaceVisuals } from './composerVisuals';
import { hapticsLight } from './haptics';

interface AgentInputContextChipsProps {
    machineName?: string | null;
    onMachineClick?: () => void;
    currentPath?: string | null;
    onPathClick?: () => void;
}

export const AgentInputContextChips = React.memo((props: AgentInputContextChipsProps) => {
    const { theme } = useUnistyles();
    const supplementalVisuals = getComposerSupplementalSurfaceVisuals(theme);

    if (props.machineName === undefined && !props.currentPath) {
        return null;
    }

    return (
        <View style={{
            backgroundColor: supplementalVisuals.backgroundColor,
            borderColor: supplementalVisuals.borderColor,
            borderWidth: 1,
            borderRadius: 12,
            padding: 8,
            marginBottom: 8,
            gap: 4,
        }}>
            {/* Machine chip */}
            {props.machineName !== undefined && props.onMachineClick && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('newSession.selectMachineAccessibility', {
                        machine: props.machineName ?? t('agentInput.noMachinesAvailable'),
                    })}
                    onPress={() => {
                        hapticsLight();
                        props.onMachineClick?.();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={(p) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderRadius: Platform.select({ default: 16, android: 20 }),
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        minWidth: 44,
                        minHeight: 44,
                        opacity: p.pressed ? 0.7 : 1,
                        gap: 6,
                    })}
                >
                    <Ionicons name="desktop-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={{
                        fontSize: 13,
                        color: theme.colors.text,
                        fontWeight: '600',
                        ...Typography.default('semiBold'),
                    }}>
                        {props.machineName === null ? t('agentInput.noMachinesAvailable') : props.machineName}
                    </Text>
                </Pressable>
            )}

            {/* Path chip */}
            {props.currentPath && props.onPathClick && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('newSession.browseFolderAccessibility', { folder: props.currentPath })}
                    onPress={() => {
                        hapticsLight();
                        props.onPathClick?.();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={(p) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderRadius: Platform.select({ default: 16, android: 20 }),
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        minWidth: 44,
                        minHeight: 44,
                        opacity: p.pressed ? 0.7 : 1,
                        gap: 6,
                    })}
                >
                    <Ionicons name="folder-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={{
                        fontSize: 13,
                        color: theme.colors.text,
                        fontWeight: '600',
                        ...Typography.default('semiBold'),
                    }}>
                        {props.currentPath}
                    </Text>
                </Pressable>
            )}
        </View>
    );
});
