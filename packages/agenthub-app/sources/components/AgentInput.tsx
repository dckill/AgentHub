import Ionicons from '@expo/vector-icons/Ionicons';
import Octicons from '@expo/vector-icons/Octicons';
import * as React from 'react';
import { View, Platform, useWindowDimensions, Text, ActivityIndicator, TouchableWithoutFeedback, Image as RNImage, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { layout } from './layout';
import { MultiTextInput, KeyPressEvent } from './MultiTextInput';
import { Typography } from '@/constants/Typography';
import { PermissionMode, ModelMode } from './PermissionModeSelector';
import { EffortLevel } from './modelModeOptions';
import { hapticsLight, hapticsError } from './haptics';
import { Shaker, ShakeInstance } from './Shaker';
import { StatusDot } from './StatusDot';
import { useActiveWord } from './autocomplete/useActiveWord';
import { useActiveSuggestions } from './autocomplete/useActiveSuggestions';
import { AgentInputAutocomplete } from './AgentInputAutocomplete';
import { FloatingOverlay } from './FloatingOverlay';
import { TextInputState, MultiTextInputHandle } from './MultiTextInput';
import { applySuggestion } from './autocomplete/applySuggestion';
import { GitStatusBadge, useHasMeaningfulGitStatus } from './GitStatusBadge';
import { AttachmentMenu } from './AttachmentMenu';
import { SlashCommandMenu } from './SlashCommandMenu';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSetting } from '@/sync/storage';
import { hackMode, hackModes } from '@/sync/modeHacks';
import { Theme } from '@/theme';
import { t } from '@/text';
import { Metadata } from '@/sync/storageTypes';
import { FileReferenceChips } from './FileReferenceChips';
import type { ImageData } from '@/sync/typesMessage';
import { getContextRemainingPercent, getContextUsagePercent } from '@/utils/contextUsage';
import { getAmberRaisedButtonVisuals } from './amberVisuals';
import {
    getComposerActionButtonVisuals,
    getComposerActionRowLayout,
    getComposerPanelVisuals,
    getComposerSendButtonChrome,
    getComposerSendButtonHighlightGeometry,
    getComposerSendButtonVisuals,
    getComposerSupplementalSurfaceVisuals,
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

interface AgentInputProps {
    value: string;
    placeholder: string;
    onChangeText: (text: string) => void;
    sessionId?: string;
    onSend: () => void;
    sendIcon?: React.ReactNode;
    permissionMode?: PermissionMode | null;
    availableModes?: PermissionMode[];
    onPermissionModeChange?: (mode: PermissionMode) => void;
    modelMode?: ModelMode | null;
    availableModels?: ModelMode[];
    onModelModeChange?: (mode: ModelMode) => void;
    effortLevel?: EffortLevel | null;
    availableEffortLevels?: EffortLevel[];
    onEffortLevelChange?: (level: EffortLevel) => void;
    metadata?: Metadata | null;
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
    onFileViewerPress?: () => void;
    agentType?: 'claude' | 'codex';
    onAgentClick?: () => void;
    machineName?: string | null;
    onMachineClick?: () => void;
    currentPath?: string | null;
    onPathClick?: () => void;
    blockSend?: boolean;
    isSendDisabled?: boolean;
    isSending?: boolean;
    minHeight?: number;
    fileReferences?: string[];
    onFileReferencesChange?: (paths: string[]) => void;
    onFilePickerOpen?: () => void;
    localFiles?: LocalFile[];
    onLocalFileRemove?: (index: number) => void;
    onLocalFilePick?: () => void;
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
    actionButtonsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minHeight: 54,
        paddingVertical: 4,
        paddingHorizontal: 0,
    },
    actionButtonsLeft: {
        flexDirection: 'row',
        gap: 8,
        flexGrow: 1,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'flex-start',
        minHeight: 54,
        overflow: 'visible',
    },
    actionButtonsViewport: {
        flex: 1,
        minWidth: 0,
        height: 54,
    },
    actionButtonsRail: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        flex: 1,
        minWidth: 0,
        minHeight: 54,
    },
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
    sendButton: {
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginLeft: 8,
        borderWidth: 1,
        overflow: 'hidden',
    },
    sendButtonActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    sendButtonInactive: {
        backgroundColor: theme.colors.button.primary.disabled,
    },
    sendButtonLocked: {
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    sendButtonInner: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonInnerPressed: {
        opacity: 0.7,
    },
    sendButtonIcon: {
        color: theme.colors.button.primary.tint,
    },
    sendButtonHighlight: {
        position: 'absolute',
        borderRadius: 999,
    },
    sendButtonSecondaryHighlight: {
        position: 'absolute',
        borderRadius: 999,
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
    const isSendBlocked = props.blockSend ?? false;

    const hasText = props.value.trim().length > 0;
    const canPressSendButton = !props.isSending
        && !props.isSendDisabled
        && (isSendBlocked ? hasText : true);
    const panelVisuals = getComposerPanelVisuals(theme);
    const supplementalVisuals = getComposerSupplementalSurfaceVisuals(theme);
    const actionVisuals = getComposerActionButtonVisuals(theme);

    // Use metadata.flavor for existing sessions, agentType prop for new sessions.
    const isCodex = props.metadata?.flavor === 'codex' || props.agentType === 'codex';
    const displayPermissionMode = React.useMemo(() => (
        props.permissionMode ? hackMode(props.permissionMode) : null
    ), [props.permissionMode]);
    const permissionModeKey = displayPermissionMode?.key ?? 'default';
    const availableModes = React.useMemo(() => (
        hackModes(props.availableModes ?? [])
    ), [props.availableModes]);
    const availableModels = props.availableModels ?? [];
    const availableEffortLevels = props.availableEffortLevels ?? [];
    const isSandboxEnabled = React.useMemo(() => {
        const sandbox = props.metadata?.sandbox as unknown;
        if (!sandbox) {
            return false;
        }
        if (typeof sandbox === 'object' && sandbox !== null && 'enabled' in sandbox) {
            return Boolean((sandbox as { enabled?: unknown }).enabled);
        }
        return true;
    }, [props.metadata?.sandbox]);
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
        flavor: props.metadata?.flavor ?? props.agentType,
        modelKey: props.modelMode?.key ?? props.metadata?.currentModelCode,
        metadata: props.metadata,
    }), [
        props.agentType,
        props.metadata,
        props.modelMode?.key,
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
    const sendButtonGradientColors = sendState === 'active' ? amberButtonVisuals.colors : sendVisuals.gradientColors;
    const sendButtonHighlightColor = sendState === 'active' ? amberButtonVisuals.highlightColor : sendVisuals.highlightColor;
    const sendButtonSecondaryHighlightColor = sendState === 'active' ? amberButtonVisuals.secondaryHighlightColor : sendVisuals.secondaryHighlightColor;
    const sendButtonHighlightGeometry = getComposerSendButtonHighlightGeometry();


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
        hapticsLight();
        setAttachmentMenuOpen(false);
        setSlashMenuOpen(false);
        setShowSettings(prev => !prev);
    }, []);

    // Handle settings selection
    const handleSettingsSelect = React.useCallback((mode: PermissionMode) => {
        hapticsLight();
        props.onPermissionModeChange?.(mode);
        setShowSettings(false);
    }, [props.onPermissionModeChange]);

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
            if (event.key === 'Tab' && event.shiftKey && props.onPermissionModeChange && availableModes.length > 0) {
                const currentIndex = availableModes.findIndex((mode) => mode.key === permissionModeKey);
                const nextIndex = ((currentIndex >= 0 ? currentIndex : 0) + 1) % availableModes.length;
                props.onPermissionModeChange(availableModes[nextIndex]);
                hapticsLight();
                return true; // Key was handled, prevent default tab behavior
            }

        }
        return false; // Key was not handled
    }, [suggestions, moveUp, moveDown, selected, handleSuggestionSelect, props.showAbortButton, props.onAbort, isAborting, handleAbortPress, agentInputEnterToSend, props.value, props.onSend, props.onPermissionModeChange, availableModes, permissionModeKey, isSendBlocked, handleBlockedSendAttempt, props.isSendDisabled]);




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
                    <>
                        <TouchableWithoutFeedback onPress={() => setShowSettings(false)}>
                            <View style={styles.overlayBackdrop} />
                        </TouchableWithoutFeedback>
                        <View style={[
                            styles.settingsOverlay,
                            { paddingHorizontal: screenWidth > 700 ? 0 : 8 }
                        ]}>
                            <FloatingOverlay maxHeight={400} keyboardShouldPersistTaps="always">
                                {/* Permission Mode Section */}
                                <View
                                    role="radiogroup"
                                    accessibilityLabel={isCodex ? t('agentInput.codexPermissionMode.title') : t('agentInput.permissionMode.title')}
                                    style={styles.overlaySection}
                                >
                                    <Text style={styles.overlaySectionTitle}>
                                        {isCodex ? t('agentInput.codexPermissionMode.title') : t('agentInput.permissionMode.title')}
                                    </Text>
                                    {availableModes.map((mode) => {
                                        const isSelected = permissionModeKey === mode.key;

                                        return (
                                            <Pressable
                                                key={mode.key}
                                                accessibilityRole="radio"
                                                accessibilityState={{ checked: isSelected }}
                                                aria-checked={isSelected}
                                                onPress={() => handleSettingsSelect(mode)}
                                                style={({ pressed }) => ({
                                                    flexDirection: 'row',
                                                    alignItems: 'flex-start',
                                                    minHeight: 44,
                                                    paddingHorizontal: 16,
                                                    paddingVertical: 8,
                                                    backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent'
                                                })}
                                            >
                                                <View style={{
                                                    width: 16,
                                                    height: 16,
                                                    borderRadius: 8,
                                                    borderWidth: 2,
                                                    borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    marginRight: 12,
                                                    marginTop: 2,
                                                }}>
                                                    {isSelected && (
                                                        <View style={{
                                                            width: 6,
                                                            height: 6,
                                                            borderRadius: 3,
                                                            backgroundColor: theme.colors.radio.dot
                                                        }} />
                                                    )}
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{
                                                        fontSize: 14,
                                                        color: theme.colors.text,
                                                        ...Typography.default()
                                                    }}>
                                                        {withSandboxSuffix(mode.name, mode.key)}
                                                    </Text>
                                                    {!!mode.description && (
                                                        <Text style={{
                                                            fontSize: 11,
                                                            color: theme.colors.textSecondary,
                                                            ...Typography.default()
                                                        }}>
                                                            {mode.description}
                                                        </Text>
                                                    )}
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                {/* Divider */}
                                <View style={{
                                    height: 1,
                                    backgroundColor: theme.colors.divider,
                                    marginHorizontal: 16
                                }} />

                                {/* Model + Effort side by side */}
                                <View style={{ flexDirection: 'row' }}>
                                    {/* Model Section */}
                                    <View
                                        role="radiogroup"
                                        accessibilityLabel={t('agentInput.model.title')}
                                        style={{ paddingVertical: 8, flex: 1 }}
                                    >
                                        <Text style={{
                                            fontSize: 12,
                                            fontWeight: '600',
                                            color: theme.colors.textSecondary,
                                            paddingHorizontal: 16,
                                            paddingBottom: 4,
                                            ...Typography.default('semiBold')
                                        }}>
                                            {t('agentInput.model.title')}
                                        </Text>
                                        {availableModels.length > 0 ? (
                                            availableModels.map((model) => {
                                                const isSelected = props.modelMode?.key === model.key;

                                                return (
                                                    <Pressable
                                                        key={model.key}
                                                        accessibilityRole="radio"
                                                        accessibilityState={{ checked: isSelected }}
                                                        aria-checked={isSelected}
                                                        onPress={() => {
                                                            hapticsLight();
                                                            props.onModelModeChange?.(model);
                                                            setShowSettings(false);
                                                        }}
                                                        style={({ pressed }) => ({
                                                            flexDirection: 'row',
                                                            alignItems: 'flex-start',
                                                            minHeight: 44,
                                                            paddingHorizontal: 16,
                                                            paddingVertical: 8,
                                                            backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent'
                                                        })}
                                                    >
                                                        <View style={{
                                                            width: 16,
                                                            height: 16,
                                                            borderRadius: 8,
                                                            borderWidth: 2,
                                                            borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            marginRight: 12,
                                                            marginTop: 2,
                                                        }}>
                                                            {isSelected && (
                                                                <View style={{
                                                                    width: 6,
                                                                    height: 6,
                                                                    borderRadius: 3,
                                                                    backgroundColor: theme.colors.radio.dot
                                                                }} />
                                                            )}
                                                        </View>
                                                        <View>
                                                            <Text style={{
                                                                fontSize: 14,
                                                                color: theme.colors.text,
                                                                ...Typography.default()
                                                            }}>
                                                                {model.name}
                                                            </Text>
                                                            {!!model.description && (
                                                                <Text style={{
                                                                    fontSize: 11,
                                                                    color: theme.colors.textSecondary,
                                                                    ...Typography.default()
                                                                }}>
                                                                    {model.description}
                                                                </Text>
                                                            )}
                                                        </View>
                                                    </Pressable>
                                                );
                                            })
                                        ) : (
                                            <Text style={{
                                                fontSize: 13,
                                                color: theme.colors.textSecondary,
                                                paddingHorizontal: 16,
                                                paddingVertical: 8,
                                                ...Typography.default()
                                            }}>
                                                {t('agentInput.model.configureInCli')}
                                            </Text>
                                        )}
                                    </View>

                                    {/* Effort Level Section — second column */}
                                    {availableEffortLevels.length > 0 && props.onEffortLevelChange && (
                                        <>
                                            <View style={{
                                                width: 1,
                                                backgroundColor: theme.colors.divider,
                                                marginVertical: 8,
                                            }} />
                                            <View
                                                role="radiogroup"
                                                accessibilityLabel={t('agentInput.effort.title')}
                                                style={{ paddingVertical: 8, flex: 1 }}
                                            >
                                                <Text style={{
                                                    fontSize: 12,
                                                    fontWeight: '600',
                                                    color: theme.colors.textSecondary,
                                                    paddingHorizontal: 16,
                                                    paddingBottom: 4,
                                                    ...Typography.default('semiBold')
                                                }}>
                                                    {t('agentInput.effort.title')}
                                                </Text>
                                                {availableEffortLevels.map((level) => {
                                                    const isSelected = props.effortLevel?.key === level.key;

                                                    return (
                                                        <Pressable
                                                            key={level.key}
                                                            accessibilityRole="radio"
                                                            accessibilityState={{ checked: isSelected }}
                                                            aria-checked={isSelected}
                                                            onPress={() => {
                                                                hapticsLight();
                                                                props.onEffortLevelChange?.(level);
                                                                setShowSettings(false);
                                                            }}
                                                            style={({ pressed }) => ({
                                                                flexDirection: 'row',
                                                                alignItems: 'flex-start',
                                                                minHeight: 44,
                                                                paddingHorizontal: 16,
                                                                paddingVertical: 8,
                                                                backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent'
                                                            })}
                                                        >
                                                            <View style={{
                                                                width: 16,
                                                                height: 16,
                                                                borderRadius: 8,
                                                                borderWidth: 2,
                                                                borderColor: isSelected ? theme.colors.radio.active : theme.colors.radio.inactive,
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                marginRight: 12,
                                                                marginTop: 2,
                                                            }}>
                                                                {isSelected && (
                                                                    <View style={{
                                                                        width: 6,
                                                                        height: 6,
                                                                        borderRadius: 3,
                                                                        backgroundColor: theme.colors.radio.dot
                                                                    }} />
                                                                )}
                                                            </View>
                                                            <View>
                                                                <Text style={{
                                                                    fontSize: 14,
                                                                    color: theme.colors.text,
                                                                    ...Typography.default()
                                                                }}>
                                                                    {level.name}
                                                                </Text>
                                                                {!!level.description && (
                                                                    <Text style={{
                                                                        fontSize: 11,
                                                                        color: theme.colors.textSecondary,
                                                                        ...Typography.default()
                                                                    }}>
                                                                        {level.description}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        </Pressable>
                                                    );
                                                })}
                                            </View>
                                        </>
                                    )}
                                </View>
                            </FloatingOverlay>
                        </View>
                    </>
                )}

                {/* Connection status, context warning, and permission mode */}
                {(props.connectionStatus || contextWarning || (displayPermissionMode && permissionModeKey !== 'default')) && (
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 16,
                        paddingBottom: 4,
                        minHeight: 20, // Fixed minimum height to prevent jumping
                    }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 11 }}>
                            {props.connectionStatus && (
                                <>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <StatusDot
                                            color={props.connectionStatus.dotColor}
                                            isPulsing={props.connectionStatus.isPulsing}
                                            size={6}
                                        />
                                        <Text style={{
                                            fontSize: 11,
                                            color: props.connectionStatus.color,
                                            ...Typography.default()
                                        }}>
                                            {props.connectionStatus.text}
                                        </Text>
                                    </View>
                                    {/* CLI Status - only shown when provided (wizard only) */}
                                    {props.connectionStatus.cliStatus && (
                                        <>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <Text style={{
                                                    fontSize: 11,
                                                    color: props.connectionStatus.cliStatus.claude
                                                        ? theme.colors.success
                                                        : theme.colors.textDestructive,
                                                    ...Typography.default()
                                                }}>
                                                    {props.connectionStatus.cliStatus.claude ? '✓' : '✗'}
                                                </Text>
                                                <Text style={{
                                                    fontSize: 11,
                                                    color: props.connectionStatus.cliStatus.claude
                                                        ? theme.colors.success
                                                        : theme.colors.textDestructive,
                                                    ...Typography.default()
                                                }}>
                                                    claude
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <Text style={{
                                                    fontSize: 11,
                                                    color: props.connectionStatus.cliStatus.codex
                                                        ? theme.colors.success
                                                        : theme.colors.textDestructive,
                                                    ...Typography.default()
                                                }}>
                                                    {props.connectionStatus.cliStatus.codex ? '✓' : '✗'}
                                                </Text>
                                                <Text style={{
                                                    fontSize: 11,
                                                    color: props.connectionStatus.cliStatus.codex
                                                        ? theme.colors.success
                                                        : theme.colors.textDestructive,
                                                    ...Typography.default()
                                                }}>
                                                    codex
                                                </Text>
                                            </View>
                                        </>
                                    )}
                                </>
                            )}
                            {contextWarning && (
                                <Text style={{
                                    fontSize: 11,
                                    color: contextWarning.color,
                                    marginLeft: props.connectionStatus ? 8 : 0,
                                    ...Typography.default()
                                }}>
                                    {props.connectionStatus ? '• ' : ''}{contextWarning.text}
                                </Text>
                            )}
                        </View>
                        {/* Permission badge — only shown when non-default */}
                        {displayPermissionMode && permissionModeKey !== 'default' && (() => {
                            const permColor = isSandboxedYoloMode ? '#4169E1' :
                                permissionModeKey === 'acceptEdits' ? theme.colors.permission.acceptEdits :
                                    permissionModeKey === 'bypassPermissions' ? theme.colors.permission.bypass :
                                        permissionModeKey === 'plan' ? theme.colors.permission.plan :
                                            permissionModeKey === 'read-only' ? theme.colors.permission.readOnly :
                                                permissionModeKey === 'safe-yolo' ? theme.colors.permission.safeYolo :
                                                    permissionModeKey === 'yolo' ? theme.colors.permission.yolo :
                                                        theme.colors.textSecondary;
                            const permIcon: 'play-forward' | 'pause' =
                                permissionModeKey === 'plan' || permissionModeKey === 'read-only'
                                    ? 'pause' : 'play-forward';
                            return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Ionicons name={permIcon} size={11} color={permColor} />
                                    <Text style={{
                                        fontSize: 11,
                                        color: permColor,
                                        ...Typography.default()
                                    }}>
                                        {withSandboxSuffix(displayPermissionMode.name, permissionModeKey)}
                                    </Text>
                                </View>
                            );
                        })()}
                    </View>
                )}

                {/* Box 1: Context Information (Machine + Path) - Only show if either exists */}
                {(props.machineName !== undefined || props.currentPath) && (
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
                                <Ionicons
                                    name="desktop-outline"
                                    size={14}
                                    color={theme.colors.textSecondary}
                                />
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
                                <Ionicons
                                    name="folder-outline"
                                    size={14}
                                    color={theme.colors.textSecondary}
                                />
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
                )}

                {/* File reference chips */}
                {props.fileReferences && props.fileReferences.length > 0 && (
                    <View style={{
                        backgroundColor: supplementalVisuals.backgroundColor,
                        borderColor: supplementalVisuals.borderColor,
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 8,
                        marginBottom: 8,
                    }}>
                        <FileReferenceChips
                            paths={props.fileReferences}
                            onRemovePath={(path) => {
                                const updated = props.fileReferences!.filter(p => p !== path);
                                props.onFileReferencesChange?.(updated);
                            }}
                        />
                    </View>
                )}

                {/* Local file chips */}
                {props.localFiles && props.localFiles.length > 0 && (
                    <View style={{
                        backgroundColor: supplementalVisuals.backgroundColor,
                        borderColor: supplementalVisuals.borderColor,
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 8,
                        marginBottom: 8,
                    }}>
                        <FileReferenceChips
                            paths={props.localFiles.map(f => f.name)}
                            onRemovePath={(name) => {
                                const index = props.localFiles!.findIndex(f => f.name === name);
                                if (index >= 0) {
                                    props.onLocalFileRemove?.(index);
                                }
                            }}
                        />
                    </View>
                )}

                {/* Attachment menu */}
                {attachmentMenuOpen && (
                    <>
                        <TouchableWithoutFeedback onPress={() => setAttachmentMenuOpen(false)}>
                            <View style={styles.overlayBackdrop} />
                        </TouchableWithoutFeedback>
                        <View style={[
                            styles.settingsOverlay,
                            { paddingHorizontal: screenWidth > 700 ? 0 : 8 }
                        ]}>
                            <FloatingOverlay maxHeight={200} keyboardShouldPersistTaps="always">
                                <AttachmentMenu
                                    onProjectFiles={() => {
                                        setAttachmentMenuOpen(false);
                                        props.onFilePickerOpen?.();
                                    }}
                                    onLocalFiles={() => {
                                        setAttachmentMenuOpen(false);
                                        props.onLocalFilePick?.();
                                    }}
                                />
                            </FloatingOverlay>
                        </View>
                    </>
                )}

                {/* Slash command menu */}
                {slashMenuOpen && props.sessionId && (
                    <>
                        <TouchableWithoutFeedback onPress={() => setSlashMenuOpen(false)}>
                            <View style={styles.overlayBackdrop} />
                        </TouchableWithoutFeedback>
                        <View style={[
                            styles.settingsOverlay,
                            { paddingHorizontal: screenWidth > 700 ? 0 : 8 }
                        ]}>
                            <FloatingOverlay maxHeight={336} keyboardShouldPersistTaps="always">
                                <SlashCommandMenu
                                    sessionId={props.sessionId}
                                    hideCompact={props.hideCompactCommand}
                                    onSelect={(cmd) => {
                                        setSlashMenuOpen(false);
                                        insertSlashCommand(
                                            cmd.insertText ?? `/${cmd.command}`,
                                            !cmd.insertText,
                                        );
                                    }}
                                />
                            </FloatingOverlay>
                        </View>
                    </>
                )}

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
                    {/* Input field */}
                    <View style={[styles.inputContainer, props.minHeight ? { minHeight: props.minHeight } : undefined]}>
                        <MultiTextInput
                            ref={inputRef}
                            value={props.value}
                            paddingTop={Platform.OS === 'web' ? 11 : 8}
                            paddingBottom={Platform.OS === 'web' ? 11 : 8}
                            textColor={panelVisuals.inputTextColor}
                            placeholderTextColor={panelVisuals.placeholderColor}
                            onChangeText={props.onChangeText}
                            placeholder={props.placeholder}
                            onKeyPress={handleKeyPress}
                            onStateChange={handleInputStateChange}
                            maxHeight={120}
                        />
                    </View>

                    {/* Action buttons below input */}
                    <View style={styles.actionButtonsContainer}>
                        <View style={{ flexDirection: 'column', flex: 1, minWidth: 0, gap: 2 }}>
                            {/* Row 1: Settings, Profile (FIRST), Agent, Abort, Git Status */}
                            <View
                                style={[
                                    styles.actionButtonsRail,
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
                                    style={styles.actionButtonsViewport}
                                    contentContainerStyle={styles.actionButtonsLeft}
                                >

                                {/* File reference picker button (opens attachment menu) */}
                                {props.onFilePickerOpen && (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={t('attachmentMenu.projectFiles')}
                                        accessibilityState={{ expanded: attachmentMenuOpen }}
                                        aria-expanded={attachmentMenuOpen}
                                        onPress={() => {
                                            hapticsLight();
                                            setShowSettings(false);
                                            setSlashMenuOpen(false);
                                            setAttachmentMenuOpen(prev => !prev);
                                        }}
                                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                        style={(p) => ({
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            borderRadius: Platform.select({ default: 16, android: 20 }),
                                            paddingHorizontal: 8,
                                            paddingVertical: 6,
                                            justifyContent: 'center',
                                            minWidth: 44,
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
                                {props.onSlashCommandSelect && (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={t('slashCommands.help')}
                                        accessibilityState={{ expanded: slashMenuOpen }}
                                        aria-expanded={slashMenuOpen}
                                        onPress={() => {
                                            hapticsLight();
                                            setShowSettings(false);
                                            setAttachmentMenuOpen(false);
                                            setSlashMenuOpen(prev => !prev);
                                        }}
                                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                        style={(p) => ({
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            borderRadius: Platform.select({ default: 16, android: 20 }),
                                            paddingHorizontal: 8,
                                            paddingVertical: 6,
                                            justifyContent: 'center',
                                            minWidth: 44,
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
                                {props.onPermissionModeChange && (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={t('agentInput.permissionMode.title')}
                                        accessibilityState={{ expanded: showSettings }}
                                        aria-expanded={showSettings}
                                        onPress={handleSettingsPress}
                                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                        style={(p) => ({
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            borderRadius: Platform.select({ default: 16, android: 20 }),
                                            paddingHorizontal: 8,
                                            paddingVertical: 6,
                                            justifyContent: 'center',
                                            minWidth: 44,
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

                                {/* Abort button */}
                                {props.onAbort && (
                                    <Shaker ref={shakerRef}>
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel={t('slashCommands.abort')}
                                            accessibilityState={{ disabled: isAborting, busy: isAborting }}
                                            style={(p) => ({
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                borderRadius: Platform.select({ default: 16, android: 20 }),
                                                paddingHorizontal: 8,
                                                paddingVertical: 6,
                                                justifyContent: 'center',
                                                minWidth: 44,
                                                minHeight: 44,
                                                opacity: p.pressed ? 0.7 : 1,
                                                backgroundColor: p.pressed ? actionVisuals.pressedBackgroundColor : actionVisuals.backgroundColor,
                                            })}
                                            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                            onPress={handleAbortPress}
                                            disabled={isAborting}
                                        >
                                            {isAborting ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color={actionVisuals.iconColor}
                                                />
                                            ) : (
                                                <Octicons
                                                    name={"stop"}
                                                    size={16}
                                                    color={actionVisuals.iconColor}
                                                />
                                            )}
                                        </Pressable>
                                    </Shaker>
                                )}

                                {/* Context compaction button */}
                                {props.onCompactPress && contextUsagePercent !== null && (
                                    <ContextRingButton
                                        percent={contextUsagePercent}
                                        onPress={() => {
                                            hapticsLight();
                                            props.onCompactPress?.();
                                        }}
                                    />
                                )}

                                {/* Git Status Badge */}
                                <GitStatusButton sessionId={props.sessionId} onPress={props.onFileViewerPress} />
                                </ScrollView>

                                {/* Send/Voice button - aligned with first row */}
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
                                        }
                                    ]}
                                >
                                    {sendButtonGradientColors ? (
                                        <>
                                            <LinearGradient
                                                pointerEvents="none"
                                                colors={sendButtonGradientColors}
                                                start={{ x: 0.18, y: 0 }}
                                                end={{ x: 0.92, y: 1 }}
                                                style={StyleSheet.absoluteFill}
                                            />
                                            {sendButtonHighlightColor ? (
                                                <View
                                                    pointerEvents="none"
                                                    style={[
                                                        styles.sendButtonHighlight,
                                                        sendButtonHighlightGeometry.primary,
                                                        { backgroundColor: sendButtonHighlightColor },
                                                    ]}
                                                />
                                            ) : null}
                                            {sendButtonSecondaryHighlightColor ? (
                                                <View
                                                    pointerEvents="none"
                                                    style={[
                                                        styles.sendButtonSecondaryHighlight,
                                                        sendButtonHighlightGeometry.secondary,
                                                        { backgroundColor: sendButtonSecondaryHighlightColor },
                                                    ]}
                                                />
                                            ) : null}
                                        </>
                                    ) : null}
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={t('agentInput.send')}
                                        accessibilityState={{ disabled: !canPressSendButton, busy: props.isSending }}
                                        style={(p) => ({
                                            width: '100%',
                                            height: '100%',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            opacity: p.pressed ? 0.7 : 1,
                                        })}
                                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                        onPress={handleSendPress}
                                        disabled={!canPressSendButton}
                                    >
                                        {props.isSending ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={sendVisuals.iconColor}
                                            />
                                        ) : isSendBlocked ? (
                                            <Ionicons
                                                name="lock-closed"
                                                size={15}
                                                color={sendVisuals.iconColor}
                                            />
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
                            </View>
                        </View>
                    </View>
                </View>
                </Shaker>
            </View>
        </View>
    );
}));

function ContextRingButton({ percent, onPress }: { percent: number; onPress: () => void }) {
    const { theme } = useUnistyles();
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
                minWidth: 44,
                minHeight: 44,
                paddingHorizontal: 8,
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

// Git Status Button Component
function GitStatusButton({ sessionId, onPress }: { sessionId?: string, onPress?: () => void }) {
    const hasMeaningfulGitStatus = useHasMeaningfulGitStatus(sessionId || '');
    const { theme } = useUnistyles();
    const actionVisuals = getComposerActionButtonVisuals(theme);

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
                paddingHorizontal: 8,
                paddingVertical: 6,
                minHeight: 44,
                opacity: p.pressed ? 0.7 : 1,
                minWidth: 44,
                flexShrink: 0,
                justifyContent: 'center',
                backgroundColor: p.pressed ? actionVisuals.pressedBackgroundColor : actionVisuals.backgroundColor,
            })}
            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
            onPress={handlePress}
        >
            {hasMeaningfulGitStatus ? (
                <GitStatusBadge sessionId={sessionId} />
            ) : (
                <Octicons
                    name="git-branch"
                    size={16}
                    color={actionVisuals.iconColor}
                />
            )}
        </Pressable>
    );
}
