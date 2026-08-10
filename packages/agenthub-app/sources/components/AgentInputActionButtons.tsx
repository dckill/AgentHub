import Octicons from '@expo/vector-icons/Octicons';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { hapticsLight } from './haptics';
import { GitStatusBadge, useHasMeaningfulGitStatus } from './GitStatusBadge';
import {
    getComposerActionButtonVisuals,
    getComposerActionRowLayout,
} from './composerVisuals';
import { useUnistyles } from 'react-native-unistyles';

export function ContextRingButton({ percent, onPress }: { percent: number; onPress: () => void }) {
    const { theme } = useUnistyles();
    const actionRowLayout = getComposerActionRowLayout();
    const size = 22;
    const strokeWidth = 2.4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const ringColor = percent >= 90
        ? theme.colors.warningCritical
        : percent >= 75
            ? theme.colors.warning
            : theme.colors.button.secondary.tint;

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('agentInput.context.compactConfirmAction')}
            accessibilityValue={{ text: t('agentInput.context.remaining', { percent: 100 - percent }) }}
            onPress={onPress}
            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
            style={(p) => ({
                minWidth: actionRowLayout.actionIconMinWidth,
                minHeight: 44,
                paddingHorizontal: 5,
                borderRadius: Platform.select({ default: 16, android: 20 }),
                alignItems: 'center',
                justifyContent: 'center',
                opacity: p.pressed ? 0.7 : 1,
            })}
        >
            <Svg width={size} height={size} style={{ position: 'absolute' }}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={theme.colors.divider}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={ringColor}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={circumference * (1 - percent / 100)}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </Svg>
            <Text style={{
                color: ringColor,
                fontSize: 7,
                lineHeight: 9,
                ...Typography.default('semiBold'),
            }}>
                {percent}
            </Text>
        </Pressable>
    );
}

export function GitStatusButton({ sessionId, onPress }: { sessionId?: string; onPress?: () => void }) {
    const hasMeaningfulGitStatus = useHasMeaningfulGitStatus(sessionId || '');
    const { theme } = useUnistyles();
    const actionVisuals = getComposerActionButtonVisuals(theme);
    const actionRowLayout = getComposerActionRowLayout();

    if (!sessionId || !onPress) {
        return null;
    }

    const handlePress = () => {
        hapticsLight();
        onPress();
    };

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('files.changes')}
            style={(p) => ({
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: Platform.select({ default: 16, android: 20 }),
                paddingHorizontal: 0,
                paddingVertical: 6,
                minHeight: 44,
                opacity: p.pressed ? 0.7 : 1,
                minWidth: actionRowLayout.actionIconMinWidth,
                flexShrink: 0,
                justifyContent: 'flex-start',
                backgroundColor: p.pressed ? actionVisuals.pressedBackgroundColor : actionVisuals.backgroundColor,
            })}
            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
            onPress={handlePress}
        >
            {hasMeaningfulGitStatus ? (
                <GitStatusBadge
                    sessionId={sessionId}
                    iconSlotWidth={actionRowLayout.actionIconMinWidth}
                />
            ) : (
                <View
                    style={{
                        width: actionRowLayout.actionIconMinWidth,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Octicons
                        name="git-branch"
                        size={16}
                        color={actionVisuals.iconColor}
                    />
                </View>
            )}
        </Pressable>
    );
}
