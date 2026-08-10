import Octicons from '@expo/vector-icons/Octicons';
import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from 'react-native';
import { t } from '@/text';
import { Shaker, ShakeInstance } from './Shaker';
import { hapticsLight } from './haptics';
import { AgentInputMenuButtons } from './AgentInputMenuButtons';
import { ContextRingButton, GitStatusButton } from './AgentInputActionButtons';
import { AgentInputSendButton, type AgentInputSendButtonProps } from './AgentInputSendButton';
import type { ComposerSendState } from './composerVisuals';

type ActionVisuals = {
    backgroundColor: string;
    iconColor: string;
    pressedBackgroundColor: string;
};

type ActionRowLayout = {
    sendGap: number;
    minActionRailWidth: number;
    actionIconMinWidth: number;
};

export type AgentInputActionRailProps = {
    actionVisuals: ActionVisuals;
    actionRowLayout: ActionRowLayout;
    attachmentMenuOpen: boolean;
    slashMenuOpen: boolean;
    settingsOpen: boolean;
    showAttachmentButton: boolean;
    showSlashCommandButton: boolean;
    showSettingsButton: boolean;
    onAttachmentPress: () => void;
    onSlashCommandPress: () => void;
    onSettingsPress: () => void;
    onAbort?: () => void | Promise<void>;
    isAborting: boolean;
    shakerRef: React.RefObject<ShakeInstance | null>;
    onAbortPress: () => void;
    contextUsagePercent: number | null;
    onCompactPress?: () => void;
    sessionId?: string;
    onFileViewerPress?: () => void;
    sendState: ComposerSendState;
    sendVisuals: AgentInputSendButtonProps['sendVisuals'];
    sendChrome: AgentInputSendButtonProps['sendChrome'];
    amberButtonVisuals: AgentInputSendButtonProps['amberButtonVisuals'];
    canPressSendButton: boolean;
    isSendBlocked: boolean;
    isSending?: boolean;
    hasText: boolean;
    onSendPress: () => void;
};

const styles = {
    container: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'flex-start' as const,
        minHeight: 54,
        paddingVertical: 4,
        paddingHorizontal: 0,
    },
    left: {
        flexDirection: 'row' as const,
        gap: 0,
        flexGrow: 1,
        flexShrink: 0,
        alignItems: 'center' as const,
        justifyContent: 'flex-start' as const,
        minHeight: 54,
        overflow: 'visible' as const,
    },
    viewport: {
        flex: 1,
        minWidth: 0,
        height: 54,
    },
    rail: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'flex-start' as const,
        flex: 1,
        minWidth: 0,
        minHeight: 54,
    },
};

export function AgentInputActionRail({
    actionVisuals,
    actionRowLayout,
    attachmentMenuOpen,
    slashMenuOpen,
    settingsOpen,
    showAttachmentButton,
    showSlashCommandButton,
    showSettingsButton,
    onAttachmentPress,
    onSlashCommandPress,
    onSettingsPress,
    onAbort,
    isAborting,
    shakerRef,
    onAbortPress,
    contextUsagePercent,
    onCompactPress,
    sessionId,
    onFileViewerPress,
    sendState,
    sendVisuals,
    sendChrome,
    amberButtonVisuals,
    canPressSendButton,
    isSendBlocked,
    isSending,
    hasText,
    onSendPress,
}: AgentInputActionRailProps) {
    return (
        <View style={styles.container}>
            <View style={{ flexDirection: 'column', flex: 1, minWidth: 0, gap: 2 }}>
                <View
                    style={[
                        styles.rail,
                        {
                            columnGap: actionRowLayout.sendGap,
                            minWidth: actionRowLayout.minActionRailWidth,
                        },
                    ]}
                >
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        bounces={false}
                        style={styles.viewport}
                        contentContainerStyle={styles.left}
                    >
                        <AgentInputMenuButtons
                            actionVisuals={actionVisuals}
                            actionRowLayout={actionRowLayout}
                            attachmentMenuOpen={attachmentMenuOpen}
                            slashMenuOpen={slashMenuOpen}
                            settingsOpen={settingsOpen}
                            showAttachmentButton={showAttachmentButton}
                            showSlashCommandButton={showSlashCommandButton}
                            showSettingsButton={showSettingsButton}
                            onAttachmentPress={onAttachmentPress}
                            onSlashCommandPress={onSlashCommandPress}
                            onSettingsPress={onSettingsPress}
                        />

                        {onAbort && (
                            <Shaker ref={shakerRef}>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={t('slashCommands.abort')}
                                    accessibilityState={{ disabled: isAborting, busy: isAborting }}
                                    style={(p) => ({
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        borderRadius: Platform.select({ default: 16, android: 20 }),
                                        paddingHorizontal: 6,
                                        paddingVertical: 6,
                                        justifyContent: 'center',
                                        minWidth: actionRowLayout.actionIconMinWidth,
                                        minHeight: 44,
                                        opacity: p.pressed ? 0.7 : 1,
                                        backgroundColor: p.pressed ? actionVisuals.pressedBackgroundColor : actionVisuals.backgroundColor,
                                    })}
                                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                    onPress={onAbortPress}
                                    disabled={isAborting}
                                >
                                    {isAborting ? (
                                        <ActivityIndicator size="small" color={actionVisuals.iconColor} />
                                    ) : (
                                        <Octicons name="stop" size={16} color={actionVisuals.iconColor} />
                                    )}
                                </Pressable>
                            </Shaker>
                        )}

                        {onCompactPress && contextUsagePercent !== null && (
                            <ContextRingButton
                                percent={contextUsagePercent}
                                onPress={() => {
                                    hapticsLight();
                                    onCompactPress();
                                }}
                            />
                        )}

                        <GitStatusButton sessionId={sessionId} onPress={onFileViewerPress} />
                    </ScrollView>

                    <AgentInputSendButton
                        sendState={sendState}
                        sendVisuals={sendVisuals}
                        sendChrome={sendChrome}
                        amberButtonVisuals={amberButtonVisuals}
                        canPressSendButton={canPressSendButton}
                        isSendBlocked={isSendBlocked}
                        isSending={isSending}
                        hasText={hasText}
                        onPress={onSendPress}
                    />
                </View>
            </View>
        </View>
    );
}
