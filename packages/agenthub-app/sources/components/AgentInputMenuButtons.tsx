import * as React from 'react';
import { Platform, Pressable, Text } from 'react-native';
import Octicons from '@expo/vector-icons/Octicons';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { hapticsLight } from './haptics';

type ActionVisuals = {
    backgroundColor: string;
    iconColor: string;
    pressedBackgroundColor: string;
};

type ActionRowLayout = {
    actionIconMinWidth: number;
};

export type AgentInputMenuButtonsProps = {
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
};

export function AgentInputMenuButtons({
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
}: AgentInputMenuButtonsProps) {
    return (
        <>
            {/* File reference picker button (opens attachment menu) */}
            {showAttachmentButton && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('attachmentMenu.projectFiles')}
                    accessibilityState={{ expanded: attachmentMenuOpen }}
                    aria-expanded={attachmentMenuOpen}
                    onPress={() => {
                        hapticsLight();
                        onAttachmentPress();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
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
                >
                    <Octicons
                        name="mention"
                        size={16}
                        color={actionVisuals.iconColor}
                    />
                </Pressable>
            )}

            {/* Slash command button */}
            {showSlashCommandButton && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('slashCommands.help')}
                    accessibilityState={{ expanded: slashMenuOpen }}
                    aria-expanded={slashMenuOpen}
                    onPress={() => {
                        hapticsLight();
                        onSlashCommandPress();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
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
                >
                    <Text style={{
                        fontSize: 15,
                        fontWeight: '700',
                        color: actionVisuals.iconColor,
                        ...Typography.default('semiBold'),
                        marginTop: -1,
                    }}>
                        /
                    </Text>
                </Pressable>
            )}

            {/* Settings button */}
            {showSettingsButton && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('agentInput.permissionMode.title')}
                    accessibilityState={{ expanded: settingsOpen }}
                    aria-expanded={settingsOpen}
                    onPress={() => {
                        hapticsLight();
                        onSettingsPress();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
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
                >
                    <Octicons
                        name={'gear'}
                        size={16}
                        color={actionVisuals.iconColor}
                    />
                </Pressable>
            )}
        </>
    );
}
