import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { t } from '@/text';
import type { ComposerSendState } from './composerVisuals';
import {
    getComposerSendButtonHighlightGeometry,
    getComposerSendButtonChrome,
    getComposerSendButtonVisuals,
} from './composerVisuals';

type SendVisuals = ReturnType<typeof getComposerSendButtonVisuals>;
type SendChrome = ReturnType<typeof getComposerSendButtonChrome>;
type HighlightGeometry = ReturnType<typeof getComposerSendButtonHighlightGeometry>;
type AmberVisuals = {
    colors: [string, string, string];
    borderColor: string;
    highlightColor: string;
    secondaryHighlightColor: string;
    shadowColor: string;
};

export type AgentInputSendButtonProps = {
    sendState: ComposerSendState;
    sendVisuals: SendVisuals;
    sendChrome: SendChrome;
    amberButtonVisuals: AmberVisuals;
    sendButtonHighlightGeometry?: HighlightGeometry;
    canPressSendButton: boolean;
    isSendBlocked: boolean;
    isSending?: boolean;
    hasText: boolean;
    onPress: () => void;
};

const styles = {
    sendButton: {
        justifyContent: 'center' as const,
        alignItems: 'center' as const,
        flexShrink: 0,
        marginLeft: 8,
        borderWidth: 1,
        overflow: 'hidden' as const,
    },
    sendButtonHighlight: {
        position: 'absolute' as const,
        borderRadius: 999,
    },
    sendButtonSecondaryHighlight: {
        position: 'absolute' as const,
        borderRadius: 999,
    },
    sendButtonIcon: {
        color: '#fff',
    },
};

export function AgentInputSendButton({
    sendState,
    sendVisuals,
    sendChrome,
    amberButtonVisuals,
    sendButtonHighlightGeometry,
    canPressSendButton,
    isSendBlocked,
    isSending = false,
    hasText,
    onPress,
}: AgentInputSendButtonProps) {
    const sendButtonGradientColors = sendState === 'active'
        ? amberButtonVisuals.colors
        : sendVisuals.gradientColors;
    const sendButtonHighlightColor = sendState === 'active'
        ? amberButtonVisuals.highlightColor
        : sendVisuals.highlightColor;
    const sendButtonSecondaryHighlightColor = sendState === 'active'
        ? amberButtonVisuals.secondaryHighlightColor
        : sendVisuals.secondaryHighlightColor;
    const highlightGeometry = sendButtonHighlightGeometry ?? getComposerSendButtonHighlightGeometry();

    return (
        <View
            style={[
                styles.sendButton,
                {
                    width: Math.max(46, sendChrome.size),
                    height: Math.max(46, sendChrome.size),
                    borderRadius: sendChrome.borderRadius,
                    backgroundColor: sendVisuals.backgroundColor,
                    borderColor: sendState === 'active' ? amberButtonVisuals.borderColor : sendVisuals.borderColor,
                    shadowColor: sendState === 'active' ? sendChrome.shadowColor : (sendVisuals.shadowColor ?? sendChrome.shadowColor),
                    shadowOpacity: sendState === 'active' ? sendChrome.shadowOpacity : (sendVisuals.shadowOpacity ?? 0),
                    shadowRadius: sendChrome.shadowRadius,
                    shadowOffset: sendChrome.shadowOffset,
                    elevation: sendState === 'active' ? sendChrome.elevation : (sendVisuals.elevation ?? 0),
                },
            ]}
        >
            {sendButtonGradientColors ? (
                <>
                    <LinearGradient
                        pointerEvents="none"
                        colors={sendButtonGradientColors}
                        start={{ x: 0.18, y: 0 }}
                        end={{ x: 0.92, y: 1 }}
                        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                    />
                    {sendButtonHighlightColor ? (
                        <View
                            pointerEvents="none"
                            style={[
                                styles.sendButtonHighlight,
                                highlightGeometry.primary,
                                { backgroundColor: sendButtonHighlightColor },
                            ]}
                        />
                    ) : null}
                    {sendButtonSecondaryHighlightColor ? (
                        <View
                            pointerEvents="none"
                            style={[
                                styles.sendButtonSecondaryHighlight,
                                highlightGeometry.secondary,
                                { backgroundColor: sendButtonSecondaryHighlightColor },
                            ]}
                        />
                    ) : null}
                </>
            ) : null}
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('agentInput.send')}
                accessibilityState={{ disabled: !canPressSendButton, busy: isSending }}
                style={(p) => ({
                    width: '100%',
                    height: '100%',
                    alignItems: 'center' as const,
                    justifyContent: 'center' as const,
                    opacity: p.pressed ? 0.7 : 1,
                })}
                hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                onPress={onPress}
                disabled={!canPressSendButton}
            >
                {isSending ? (
                    <ActivityIndicator size="small" color={sendVisuals.iconColor} />
                ) : isSendBlocked ? (
                    <Ionicons name="lock-closed" size={15} color={sendVisuals.iconColor} />
                ) : hasText ? (
                    <Ionicons
                        name="paper-plane"
                        size={19}
                        color={sendState === 'active' ? sendChrome.iconColor : sendVisuals.iconColor}
                        style={[
                            styles.sendButtonIcon,
                            {
                                transform: [
                                    { translateX: sendChrome.iconTranslateX },
                                    { translateY: sendChrome.iconTranslateY },
                                ],
                            },
                        ]}
                    />
                ) : (
                    <Ionicons
                        name="paper-plane-outline"
                        size={18}
                        color={sendVisuals.iconColor}
                        style={[
                            styles.sendButtonIcon,
                            {
                                transform: [
                                    { translateX: sendChrome.iconTranslateX },
                                    { translateY: sendChrome.iconTranslateY },
                                ],
                            },
                        ]}
                    />
                )}
            </Pressable>
        </View>
    );
}
