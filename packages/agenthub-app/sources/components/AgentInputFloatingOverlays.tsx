import * as React from 'react';
import { TouchableWithoutFeedback, View, type StyleProp, type ViewStyle } from 'react-native';
import { AttachmentMenu } from './AttachmentMenu';
import { FloatingOverlay } from './FloatingOverlay';
import { SlashCommandMenu } from './SlashCommandMenu';
import type { CommandItem } from '@/sync/suggestionCommands';

export type AgentInputFloatingOverlaysProps = {
    attachmentMenuOpen: boolean;
    slashMenuOpen: boolean;
    isWide: boolean;
    sessionId?: string;
    hideCompactCommand?: boolean;
    overlayBackdropStyle: StyleProp<ViewStyle>;
    settingsOverlayStyle: StyleProp<ViewStyle>;
    onAttachmentDismiss: () => void;
    onProjectFiles: () => void;
    onLocalFiles: () => void;
    onSlashDismiss: () => void;
    onSlashSelect: (command: CommandItem) => void;
};

export function AgentInputFloatingOverlays(props: AgentInputFloatingOverlaysProps) {
    return (
        <>
            {props.attachmentMenuOpen && (
                <>
                    <TouchableWithoutFeedback onPress={props.onAttachmentDismiss}>
                        <View style={props.overlayBackdropStyle} />
                    </TouchableWithoutFeedback>
                    <View style={[props.settingsOverlayStyle, { paddingHorizontal: props.isWide ? 0 : 8 }]}>
                        <FloatingOverlay maxHeight={200} keyboardShouldPersistTaps="always">
                            <AttachmentMenu
                                onProjectFiles={props.onProjectFiles}
                                onLocalFiles={props.onLocalFiles}
                            />
                        </FloatingOverlay>
                    </View>
                </>
            )}

            {props.slashMenuOpen && props.sessionId && (
                <>
                    <TouchableWithoutFeedback onPress={props.onSlashDismiss}>
                        <View style={props.overlayBackdropStyle} />
                    </TouchableWithoutFeedback>
                    <View style={[props.settingsOverlayStyle, { paddingHorizontal: props.isWide ? 0 : 8 }]}>
                        <FloatingOverlay maxHeight={336} keyboardShouldPersistTaps="always">
                            <SlashCommandMenu
                                sessionId={props.sessionId}
                                hideCompact={props.hideCompactCommand}
                                onSelect={props.onSlashSelect}
                            />
                        </FloatingOverlay>
                    </View>
                </>
            )}
        </>
    );
}
