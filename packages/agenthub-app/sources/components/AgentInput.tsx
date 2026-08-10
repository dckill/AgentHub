import * as React from 'react';
import { View, Platform, useWindowDimensions, Text, ActivityIndicator, Image as RNImage } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { layout } from './layout';
import { KeyPressEvent } from './MultiTextInput';
import { Typography } from '@/constants/Typography';
import { PermissionMode, ModelMode } from './PermissionModeSelector';
import { EffortLevel } from './modelModeOptions';
import { hapticsLight, hapticsError } from './haptics';
import { Shaker, ShakeInstance } from './Shaker';
import { AgentInputStatusBar } from './AgentInputStatusBar';
import { AgentInputContextChips } from './AgentInputContextChips';
import { AgentInputReferenceChips } from './AgentInputReferenceChips';
import { useActiveWord } from './autocomplete/useActiveWord';
import { useActiveSuggestions } from './autocomplete/useActiveSuggestions';
import { AgentInputAutocomplete } from './AgentInputAutocomplete';
import { AgentInputSettingsOverlay } from './AgentInputSettingsOverlay';
import { AgentInputFloatingOverlays } from './AgentInputFloatingOverlays';
import { AgentInputTextField } from './AgentInputTextField';
import { AgentInputActionRail } from './AgentInputActionRail';
import { TextInputState, MultiTextInputHandle } from './MultiTextInput';
import { applySuggestion } from './autocomplete/applySuggestion';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSetting } from '@/sync/storage';
import { hackMode, hackModes } from '@/sync/modeHacks';
import { Theme } from '@/theme';
import { t } from '@/text';
import { Metadata } from '@/sync/storageTypes';
import type { ImageData } from '@/sync/typesMessage';
import { getContextRemainingPercent, getContextUsagePercent } from '@/utils/contextUsage';
import { getAmberRaisedButtonVisuals } from './amberVisuals';
import {
    getComposerActionButtonVisuals,
    getComposerActionRowLayout,
    getComposerPanelVisuals,
    getComposerSendButtonChrome,
    getComposerSendButtonVisuals,
    type ComposerSendState,
} from './composerVisuals';

interface LocalFile {
    name: string;
    mimeType: string;
    data: string;
    size: number;
    width?: number;
    height?: number;
    uri?: string;
}

export type { LocalFile };

export interface AgentInputSessionContext {
    sessionId?: string;
    metadata?: Metadata | null;
    agentType?: 'claude' | 'codex';
    machineName?: string | null;
    onMachineClick?: () => void;
    currentPath?: string | null;
    onPathClick?: () => void;
}

export interface AgentInputSettingsContext {
    permissionMode?: PermissionMode | null;
    availableModes?: PermissionMode[];
    onPermissionModeChange?: (mode: PermissionMode) => void;
    modelMode?: ModelMode | null;
    availableModels?: ModelMode[];
    onModelModeChange?: (mode: ModelMode) => void;
    effortLevel?: EffortLevel | null;
    availableEffortLevels?: EffortLevel[];
    onEffortLevelChange?: (level: EffortLevel) => void;
}

export interface AgentInputAttachmentContext {
    fileReferences?: string[];
    onFileReferencesChange?: (paths: string[]) => void;
    onFilePickerOpen?: () => void;
    localFiles?: LocalFile[];
    onLocalFileRemove?: (index: number) => void;
    onLocalFilePick?: () => void;
    onFileViewerPress?: () => void;
}

interface AgentInputProps {
    value: string;
    placeholder: string;
    onChangeText: (text: string) => void;
    sessionContext?: AgentInputSessionContext;
    onSend: () => void;
    sendIcon?: React.ReactNode;
    settings?: AgentInputSettingsContext;
    attachments?: AgentInputAttachmentContext;
    onAbort?: () => void | Promise<void>;
    showAbortButton?: boolean;
    connectionStatus?: {
        text: string;
        color: string;
        dotColor: string;
        isPulsing?: boolean;
        cliStatus?: {
            claude: boolean | null;
            codex: boolean | null;
        };
    };
    autocompletePrefixes: string[];
    autocompleteSuggestions: (query: string) => Promise<{ key: string, text: string, component: React.ElementType }[]>;
    usageData?: {
        inputTokens: number;
        outputTokens: number;
        cacheCreation: number;
        cacheRead: number;
        contextSize: number;
        contextWindow?: number;
    };
    alwaysShowContextSize?: boolean;
    onAgentClick?: () => void;
    blockSend?: boolean;
    isSendDisabled?: boolean;
    isSending?: boolean;
    minHeight?: number;
    onSlashCommandSelect?: (command: string) => void;
    hideCompactCommand?: boolean;
    onCompactPress?: () => void;
}

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        alignItems: 'center',
        paddingBottom: 8,
        paddingTop: 8,
    },
    innerContainer: {
        width: '100%',
        position: 'relative',
    },
    unifiedPanel: {
        backgroundColor: getComposerPanelVisuals(theme).backgroundColor,
        borderColor: getComposerPanelVisuals(theme).borderColor,
        borderWidth: 1,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        overflow: 'hidden',
        paddingVertical: 2,
        paddingBottom: 8,
        paddingHorizontal: 8,
        shadowColor: getComposerPanelVisuals(theme).shadowColor,
        shadowOpacity: theme.dark ? 0.22 : 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
    },
    unifiedPanelGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    unifiedPanelTopHighlight: {
        position: 'absolute',
        top: 0,
        left: 10,
        right: 10,
        height: StyleSheet.hairlineWidth,
    },
    unifiedPanelBottomShade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 28,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 0,
        paddingLeft: 8,
        paddingRight: 8,
        paddingVertical: 4,
        minHeight: 40,
    },

    // Overlay styles
    autocompleteOverlay: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 1000,
    },
    settingsOverlay: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 1000,
    },
    overlayBackdrop: {
        position: 'absolute',
        top: -1000,
        left: -1000,
        right: -1000,
        bottom: -1000,
        zIndex: 999,
    },
    overlaySection: {
        paddingVertical: 8,
    },
    overlaySectionTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        paddingHorizontal: 16,
        paddingBottom: 4,
        ...Typography.default('semiBold'),
    },
    overlayDivider: {
        height: 1,
        backgroundColor: theme.colors.divider,
        marginHorizontal: 16,
    },

    // Selection styles
    selectionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: 'transparent',
    },
    selectionItemPressed: {
        backgroundColor: theme.colors.surfacePressed,
    },
    radioButton: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    radioButtonActive: {
        borderColor: theme.colors.radio.active,
    },
    radioButtonInactive: {
        borderColor: theme.colors.radio.inactive,
    },
    radioButtonDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.radio.dot,
    },
    selectionLabel: {
        fontSize: 14,
        ...Typography.default(),
    },
    selectionLabelActive: {
        color: theme.colors.radio.active,
    },
    selectionLabelInactive: {
        color: theme.colors.text,
    },

    // Status styles
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 4,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        fontSize: 11,
        ...Typography.default(),
    },
    permissionModeContainer: {
        flexDirection: 'column',
        alignItems: 'flex-end',
    },
    permissionModeText: {
        fontSize: 11,
        ...Typography.default(),
    },
    contextWarningText: {
        fontSize: 11,
        marginLeft: 8,
        ...Typography.default(),
    },

    // Button styles
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingHorizontal: 8,
        paddingVertical: 6,
        justifyContent: 'center',
        height: 32,
    },
    actionButtonPressed: {
        opacity: 0.7,
    },
    actionButtonIcon: {
        color: theme.colors.button.secondary.tint,
    },
}));

const getContextWarning = (percentageRemaining: number | null, alwaysShow: boolean = false, theme: Theme) => {
    if (percentageRemaining === null) {
        return null;
    }
    if (percentageRemaining <= 5) {
        return { text: t('agentInput.context.remaining', { percent: percentageRemaining }), color: theme.colors.warningCritical };
    } else if (percentageRemaining <= 10) {
        return { text: t('agentInput.context.remaining', { percent: percentageRemaining }), color: theme.colors.warning };
    } else if (alwaysShow) {
        // Show context remaining in neutral color when not near limit
        return { text: t('agentInput.context.remaining', { percent: percentageRemaining }), color: theme.colors.warning };
    }
    return null; // No display needed
};

export const AgentInput = React.memo(React.forwardRef<MultiTextInputHandle, AgentInputProps>((props, ref) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const screenWidth = useWindowDimensions().width;
    const sessionContext = props.sessionContext ?? {};
    const settings = props.settings ?? {};
    const attachments = props.attachments ?? {};
    const isSendBlocked = props.blockSend ?? false;

    const hasText = props.value.trim().length > 0;
    const canPressSendButton = !props.isSending
        && !props.isSendDisabled
        && (isSendBlocked ? hasText : true);
    const panelVisuals = getComposerPanelVisuals(theme);
    const actionVisuals = getComposerActionButtonVisuals(theme);

    // Use session context metadata for existing sessions and agent type for new sessions.
    const isCodex = sessionContext.metadata?.flavor === 'codex' || sessionContext.agentType === 'codex';
    const displayPermissionMode = React.useMemo(() => (
        settings.permissionMode ? hackMode(settings.permissionMode) : null
    ), [settings.permissionMode]);
    const permissionModeKey = displayPermissionMode?.key ?? 'default';
    const availableModes = React.useMemo(() => (
        hackModes(settings.availableModes ?? [])
    ), [settings.availableModes]);
    const availableModels = settings.availableModels ?? [];
    const availableEffortLevels = settings.availableEffortLevels ?? [];
    const isSandboxEnabled = React.useMemo(() => {
        const sandbox = sessionContext.metadata?.sandbox as unknown;
        if (!sandbox) {
            return false;
        }
        if (typeof sandbox === 'object' && sandbox !== null && 'enabled' in sandbox) {
            return Boolean((sandbox as { enabled?: unknown }).enabled);
        }
        return true;
    }, [sessionContext.metadata?.sandbox]);
    const isSandboxedYoloMode = isSandboxEnabled && (
        permissionModeKey === 'bypassPermissions' || permissionModeKey === 'yolo'
    );

    const withSandboxSuffix = React.useCallback((label: string, modeKey?: string) => {
        if (!isSandboxEnabled) {
            return label;
        }
        if (modeKey === 'bypassPermissions' || modeKey === 'yolo') {
            return `${label} ${t('session.sandboxed')}`;
        }
        return label;
    }, [isSandboxEnabled]);

    // Calculate context warning
    const contextUsageInput = React.useMemo(() => ({
        contextSize: props.usageData?.contextSize,
        contextWindow: props.usageData?.contextWindow,
        flavor: sessionContext.metadata?.flavor ?? sessionContext.agentType,
        modelKey: settings.modelMode?.key ?? sessionContext.metadata?.currentModelCode,
        metadata: sessionContext.metadata,
    }), [
        sessionContext.agentType,
        sessionContext.metadata,
        settings.modelMode?.key,
        props.usageData?.contextSize,
        props.usageData?.contextWindow,
    ]);
    const contextWarning = getContextWarning(
        getContextRemainingPercent(contextUsageInput),
        props.alwaysShowContextSize ?? false,
        theme,
    );
    const contextUsagePercent = getContextUsagePercent(contextUsageInput);

    const agentInputEnterToSend = useSetting('agentInputEnterToSend');
    const sendState: ComposerSendState = isSendBlocked
        ? 'locked'
        : (!props.isSendDisabled && (hasText || props.isSending)) ? 'active' : 'idle';
    const sendVisuals = getComposerSendButtonVisuals(theme, sendState);
    const sendChrome = getComposerSendButtonChrome(theme);
    const actionRowLayout = getComposerActionRowLayout();
    const amberButtonVisuals = getAmberRaisedButtonVisuals(theme);
    // Abort button state
    const [isAborting, setIsAborting] = React.useState(false);
    const shakerRef = React.useRef<ShakeInstance>(null);
    const sendBlockShakerRef = React.useRef<ShakeInstance>(null);
    const inputRef = React.useRef<MultiTextInputHandle>(null);

    // Forward ref to the MultiTextInput
    React.useImperativeHandle(ref, () => inputRef.current!, []);

    // Autocomplete state - track text and selection together
    const [inputState, setInputState] = React.useState<TextInputState>({
        text: props.value,
        selection: { start: 0, end: 0 }
    });

    // Handle combined text and selection state changes
    const handleInputStateChange = React.useCallback((newState: TextInputState) => {
        // console.log('📝 Input state changed:', JSON.stringify(newState));
        setInputState(newState);
    }, []);

    // Use the tracked selection from inputState
    const activeWord = useActiveWord(inputState.text, inputState.selection, props.autocompletePrefixes);
    // Using default options: clampSelection=true, autoSelectFirst=true, wrapAround=true
    // To customize: useActiveSuggestions(activeWord, props.autocompleteSuggestions, { clampSelection: false, wrapAround: false })
    const [suggestions, selected, moveUp, moveDown] = useActiveSuggestions(activeWord, props.autocompleteSuggestions, { clampSelection: true, wrapAround: true });

    // Debug logging
    // React.useEffect(() => {
    //     console.log('🔍 Autocomplete Debug:', JSON.stringify({
    //         value: props.value,
    //         inputState,
    //         activeWord,
    //         suggestionsCount: suggestions.length,
    //         selected,
    //         prefixes: props.autocompletePrefixes
    //     }, null, 2));
    // }, [props.value, inputState, activeWord, suggestions.length, selected]);

    // Handle suggestion selection
    const handleSuggestionSelect = React.useCallback((index: number) => {
        if (!suggestions[index] || !inputRef.current) return;

        const suggestion = suggestions[index];

        // Apply the suggestion
        const result = applySuggestion(
            inputState.text,
            inputState.selection,
            suggestion.text,
            props.autocompletePrefixes,
            true // add space after
        );

        // Use imperative API to set text and selection
        inputRef.current.setTextAndSelection(result.text, {
            start: result.cursorPosition,
            end: result.cursorPosition
        });

        // console.log('Selected suggestion:', suggestion.text);

        // Small haptic feedback
        hapticsLight();
    }, [suggestions, inputState, props.autocompletePrefixes]);

    const insertSlashCommand = React.useCallback((insertText: string, addSpace: boolean) => {
        const text = inputState.text ?? props.value;
        const selection = inputState.selection ?? { start: text.length, end: text.length };
        const result = applySuggestion(
            text,
            selection,
            insertText,
            ['/'],
            addSpace,
        );

        inputRef.current?.setTextAndSelection(result.text, {
            start: result.cursorPosition,
            end: result.cursorPosition,
        });
        props.onChangeText(result.text);
    }, [inputState.selection, inputState.text, props]);

    // Settings modal state
    const [showSettings, setShowSettings] = React.useState(false);
    const [attachmentMenuOpen, setAttachmentMenuOpen] = React.useState(false);
    const [slashMenuOpen, setSlashMenuOpen] = React.useState(false);

    // Handle settings button press
    const handleSettingsPress = React.useCallback(() => {
        setAttachmentMenuOpen(false);
        setSlashMenuOpen(false);
        setShowSettings(prev => !prev);
    }, []);

    // Handle settings selection
    const handleSettingsSelect = React.useCallback((mode: PermissionMode) => {
        hapticsLight();
        settings.onPermissionModeChange?.(mode);
        setShowSettings(false);
    }, [settings.onPermissionModeChange]);

    // Handle abort button press
    const handleAbortPress = React.useCallback(async () => {
        if (!props.onAbort) return;

        hapticsError();
        setIsAborting(true);
        const startTime = Date.now();

        try {
            await props.onAbort?.();

            // Ensure minimum 300ms loading time
            const elapsed = Date.now() - startTime;
            if (elapsed < 300) {
                await new Promise(resolve => setTimeout(resolve, 300 - elapsed));
            }
        } catch (error) {
            // Shake on error
            shakerRef.current?.shake();
            console.error('Abort RPC call failed:', error);
        } finally {
            setIsAborting(false);
        }
    }, [props.onAbort]);

    const handleBlockedSendAttempt = React.useCallback(() => {
        if (!isSendBlocked || !hasText || props.isSending) return;
        hapticsError();
        sendBlockShakerRef.current?.shake();
    }, [hasText, isSendBlocked, props.isSending]);

    const handleSendPress = React.useCallback(() => {
        if (isSendBlocked) {
            handleBlockedSendAttempt();
            return;
        }
        if (props.isSendDisabled || props.isSending) return;

        hapticsLight();
        if (hasText) {
            props.onSend();
        }
    }, [handleBlockedSendAttempt, hasText, isSendBlocked, props]);

    // Handle keyboard navigation
    const handleKeyPress = React.useCallback((event: KeyPressEvent): boolean => {
        // Handle autocomplete navigation first
        if (suggestions.length > 0) {
            if (event.key === 'ArrowUp') {
                moveUp();
                return true;
            } else if (event.key === 'ArrowDown') {
                moveDown();
                return true;
            } else if ((event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
                // Both Enter and Tab select the current suggestion
                // If none selected (selected === -1), select the first one
                const indexToSelect = selected >= 0 ? selected : 0;
                handleSuggestionSelect(indexToSelect);
                return true;
            } else if (event.key === 'Escape') {
                // Clear suggestions by collapsing selection (triggers activeWord to clear)
                if (inputRef.current) {
                    const cursorPos = inputState.selection.start;
                    inputRef.current.setTextAndSelection(inputState.text, {
                        start: cursorPos,
                        end: cursorPos
                    });
                }
                return true;
            }
        }

        // Handle Escape for abort when no suggestions are visible
        if (event.key === 'Escape' && props.showAbortButton && props.onAbort && !isAborting) {
            handleAbortPress();
            return true;
        }

        // Original key handling
        if (Platform.OS === 'web') {
            // On mobile web (touch devices), Enter should insert a newline since
            // there's no Shift key available. Users send via the send button instead.
            // Use pointer:coarse media query instead of ontouchstart/maxTouchPoints
            // to avoid false positives on Windows touch-screen laptops with keyboards.
            const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
            if (agentInputEnterToSend && event.key === 'Enter' && !event.shiftKey && !isTouchDevice) {
                if (props.value.trim()) {
                    if (isSendBlocked) {
                        handleBlockedSendAttempt();
                    } else if (!props.isSendDisabled) {
                        props.onSend();
                    }
                    return true; // Key was handled
                }
            }
            // Handle Shift+Tab for permission mode switching
            if (event.key === 'Tab' && event.shiftKey && settings.onPermissionModeChange && availableModes.length > 0) {
                const currentIndex = availableModes.findIndex((mode) => mode.key === permissionModeKey);
                const nextIndex = ((currentIndex >= 0 ? currentIndex : 0) + 1) % availableModes.length;
                settings.onPermissionModeChange(availableModes[nextIndex]);
                hapticsLight();
                return true; // Key was handled, prevent default tab behavior
            }

        }
        return false; // Key was not handled
    }, [suggestions, moveUp, moveDown, selected, handleSuggestionSelect, props.showAbortButton, props.onAbort, isAborting, handleAbortPress, agentInputEnterToSend, props.value, props.onSend, settings.onPermissionModeChange, availableModes, permissionModeKey, isSendBlocked, handleBlockedSendAttempt, props.isSendDisabled]);




    return (
        <View style={[
            styles.container,
            { paddingHorizontal: screenWidth > 700 ? 12 : 8 }
        ]}>
            <View style={[
                styles.innerContainer,
                { maxWidth: layout.maxWidth }
            ]}>
                {/* Autocomplete suggestions overlay */}
                {suggestions.length > 0 && (
                    <View style={[
                        styles.autocompleteOverlay,
                        { paddingHorizontal: screenWidth > 700 ? 0 : 8 }
                    ]}>
                        <AgentInputAutocomplete
                            suggestions={suggestions.map(s => {
                                const Component = s.component;
                                return <Component key={s.key} />;
                            })}
                            selectedIndex={selected}
                            onSelect={handleSuggestionSelect}
                            itemHeight={48}
                        />
                    </View>
                )}

                {/* Settings overlay */}
                {showSettings && (
                    <AgentInputSettingsOverlay
                        isCodex={isCodex}
                        isWide={screenWidth > 700}
                        availableModes={availableModes}
                        permissionModeKey={permissionModeKey}
                        availableModels={availableModels}
                        modelModeKey={settings.modelMode?.key}
                        availableEffortLevels={availableEffortLevels}
                        effortLevelKey={settings.effortLevel?.key}
                        onDismiss={() => setShowSettings(false)}
                        onPermissionModeChange={handleSettingsSelect}
                        onModelModeChange={settings.onModelModeChange}
                        onEffortLevelChange={settings.onEffortLevelChange}
                        withSandboxSuffix={withSandboxSuffix}
                    />
                )}

                {/* Connection status, context warning, and permission mode */}
                {(props.connectionStatus || contextWarning || (displayPermissionMode && permissionModeKey !== 'default')) && (
                    <AgentInputStatusBar
                        connectionStatus={props.connectionStatus}
                        contextWarning={contextWarning}
                        displayPermissionMode={displayPermissionMode}
                        permissionModeKey={permissionModeKey}
                        isSandboxedYoloMode={isSandboxedYoloMode}
                        withSandboxSuffix={withSandboxSuffix}
                    />
                )}

                {/* Box 1: Context Information (Machine + Path) - Only show if either exists */}
                <AgentInputContextChips
                    machineName={sessionContext.machineName}
                    onMachineClick={sessionContext.onMachineClick}
                    currentPath={sessionContext.currentPath}
                    onPathClick={sessionContext.onPathClick}
                />

                {/* File reference chips */}
                <AgentInputReferenceChips
                    fileReferences={attachments.fileReferences}
                    onFileReferencesChange={attachments.onFileReferencesChange}
                    localFiles={attachments.localFiles}
                    onLocalFileRemove={attachments.onLocalFileRemove}
                />

                <AgentInputFloatingOverlays
                    attachmentMenuOpen={attachmentMenuOpen}
                    slashMenuOpen={slashMenuOpen}
                    isWide={screenWidth > 700}
                    sessionId={sessionContext.sessionId}
                    hideCompactCommand={props.hideCompactCommand}
                    overlayBackdropStyle={styles.overlayBackdrop}
                    settingsOverlayStyle={styles.settingsOverlay}
                    onAttachmentDismiss={() => setAttachmentMenuOpen(false)}
                    onProjectFiles={() => {
                        setAttachmentMenuOpen(false);
                        attachments.onFilePickerOpen?.();
                    }}
                    onLocalFiles={() => {
                        setAttachmentMenuOpen(false);
                        attachments.onLocalFilePick?.();
                    }}
                    onSlashDismiss={() => setSlashMenuOpen(false)}
                    onSlashSelect={(cmd) => {
                        setSlashMenuOpen(false);
                        insertSlashCommand(
                            cmd.insertText ?? `/${cmd.command}`,
                            !cmd.insertText,
                        );
                    }}
                />

                {/* Box 2: Action Area (Input + Send) */}
                <Shaker ref={sendBlockShakerRef}>
                <View style={styles.unifiedPanel}>
                    <LinearGradient
                        pointerEvents="none"
                        colors={panelVisuals.gradientColors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.unifiedPanelGradient}
                    />
                    <View
                        pointerEvents="none"
                        style={[
                            styles.unifiedPanelTopHighlight,
                            { backgroundColor: panelVisuals.topHighlightColor },
                        ]}
                    />
                    <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(0, 0, 0, 0)', panelVisuals.bottomShadeColor]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.unifiedPanelBottomShade}
                    />
                    <AgentInputTextField
                        inputRef={inputRef}
                        inputContainerStyle={styles.inputContainer}
                        value={props.value}
                        minHeight={props.minHeight}
                        textColor={panelVisuals.inputTextColor}
                        placeholderTextColor={panelVisuals.placeholderColor}
                        onChangeText={props.onChangeText}
                        placeholder={props.placeholder}
                        onKeyPress={handleKeyPress}
                        onStateChange={handleInputStateChange}
                    />

                    <AgentInputActionRail
                        actionVisuals={actionVisuals}
                        actionRowLayout={actionRowLayout}
                        attachmentMenuOpen={attachmentMenuOpen}
                        slashMenuOpen={slashMenuOpen}
                        settingsOpen={showSettings}
                        showAttachmentButton={Boolean(attachments.onFilePickerOpen)}
                        showSlashCommandButton={Boolean(props.onSlashCommandSelect)}
                        showSettingsButton={Boolean(settings.onPermissionModeChange)}
                        onAttachmentPress={() => {
                            setShowSettings(false);
                            setSlashMenuOpen(false);
                            setAttachmentMenuOpen(prev => !prev);
                        }}
                        onSlashCommandPress={() => {
                            setShowSettings(false);
                            setAttachmentMenuOpen(false);
                            setSlashMenuOpen(prev => !prev);
                        }}
                        onSettingsPress={handleSettingsPress}
                        onAbort={props.onAbort}
                        isAborting={isAborting}
                        shakerRef={shakerRef}
                        onAbortPress={handleAbortPress}
                        contextUsagePercent={contextUsagePercent}
                        onCompactPress={props.onCompactPress}
                        sessionId={sessionContext.sessionId}
                        onFileViewerPress={attachments.onFileViewerPress}
                        sendState={sendState}
                        sendVisuals={sendVisuals}
                        sendChrome={sendChrome}
                        amberButtonVisuals={amberButtonVisuals}
                        canPressSendButton={canPressSendButton}
                        isSendBlocked={isSendBlocked}
                        isSending={props.isSending}
                        hasText={hasText}
                        onSendPress={handleSendPress}
                    />
                </View>
                </Shaker>
            </View>
        </View>
    );
}));
