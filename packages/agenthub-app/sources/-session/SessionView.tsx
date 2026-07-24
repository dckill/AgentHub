import { AgentContentView } from '@/components/AgentContentView';
import { AgentGoalBar, type AgentGoalAction } from '@/components/AgentGoalBar';
import { AgentInput } from '@/components/AgentInput';
import { layout } from '@/components/layout';
import {
    getAvailableModels,
    getAvailablePermissionModes,
    getDefaultModelKey,
    getDefaultPermissionModeKey,
    getEffortLevelsForModel,
    getDefaultEffortKeyForModel,
    resolveCurrentOption,
    EffortLevel,
} from '@/components/modelModeOptions';
import { getSuggestions } from '@/components/autocomplete/suggestions';
import { resolveVisibleAgentGoalStatus } from '@/components/agentGoalStatus';
import { ChatHeaderView } from '@/components/ChatHeaderView';
import { ChatList } from '@/components/ChatList';
import { Deferred } from '@/components/Deferred';
import { EmptyMessages } from '@/components/EmptyMessages';
import { useDraft } from '@/hooks/useDraft';
import { Modal } from '@/modal';
import { gitStatusSync } from '@/sync/gitStatusSync';
import { sessionAbort, sessionGoalAction, sessionPermissionMode } from '@/sync/ops';
import { storage, useIsDataReady, useLocalSetting, useLocalSettingMutable, useOfficialResumeSession, useSessionMessages, useSessionUsage, useSetting } from '@/sync/storage';
import { useSession } from '@/sync/storage';
import { useEnsureSessionLoaded } from '@/hooks/useEnsureSessionLoaded';
import { Session } from '@/sync/storageTypes';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { tracking } from '@/track';
import { isRunningOnMac } from '@/utils/platform';
import { useDeviceType, useHeaderHeight, useIsLandscape, useIsTablet } from '@/utils/responsive';
import { FilesSidebar } from '@/components/FilesSidebar';
import { DirectoryTreeDrawer } from '@/components/DirectoryTreeDrawer';
import { InlineFileDiff } from '@/components/InlineFileDiff';
import { FileReferencePicker } from '@/components/FileReferencePicker';
import type { LocalFile } from '@/components/AgentInput';
import { performAgentGoalAction } from './agentGoalActionHandler';
import { GitFileStatus } from '@/sync/gitStatusFiles';
import { getResumeCommandBlock, getSessionName, useSessionStatus } from '@/utils/sessionUtils';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { isVersionSupported, MINIMUM_CLI_VERSION } from '@/utils/versionUtils';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { useMemo } from 'react';
import { ActivityIndicator, Modal as RNModal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnistyles } from 'react-native-unistyles';
import type { ModelMode, PermissionMode } from '@/components/PermissionModeSelector';
import { OFFICIAL_RESUME_PENDING_TIMEOUT_MS, shouldKeepOfficialResumePending } from './officialResumePending';
import { createChatSubmissionDeduper } from './chatSubmissionDedup';
import { shouldMarkVisibleSessionCompletionViewed } from './visibleSessionCompletionView';
import { shouldShowSessionLoadingOverlay } from './sessionLoadingOverlay';
import { getSessionLifecycleVisual } from '@/utils/sessionLifecycleStatus';
import { resolveSessionMessagePlaceholder, type SessionMessageLoadError } from '@/sync/sessionMessageLoadState';

function SessionMessageLoadErrorView(props: { error: SessionMessageLoadError; onRetry: () => void }) {
    const { theme } = useUnistyles();
    const title = props.error === 'timeout' ? t('errors.connectionTimeout') : t('errors.networkError');
    return (
        <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${title}. ${t('errors.tryAgain')}`}
            style={{
                width: '100%',
                maxWidth: 420,
                alignSelf: 'center',
                alignItems: 'center',
                paddingHorizontal: 24,
                paddingVertical: 28,
            }}
        >
            <View style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.divider,
            }}>
                <Ionicons name="cloud-offline-outline" size={24} color={theme.colors.textSecondary} />
            </View>
            <Text accessibilityRole="header" style={{
                marginTop: 14,
                color: theme.colors.text,
                fontSize: 17,
                lineHeight: 23,
                fontWeight: '600',
                textAlign: 'center',
            }}>
                {title}
            </Text>
            <Text style={{
                marginTop: 6,
                color: theme.colors.textSecondary,
                fontSize: 14,
                lineHeight: 20,
                textAlign: 'center',
            }}>
                {t('errors.tryAgain')}
            </Text>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
                focusable
                onPress={props.onRetry}
                style={({ pressed }) => ({
                    minWidth: 120,
                    minHeight: 44,
                    marginTop: 18,
                    paddingHorizontal: 20,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.accent,
                    opacity: pressed ? 0.82 : 1,
                })}
            >
                <Text style={{ color: theme.colors.button.primary.tint, fontSize: 15, fontWeight: '600' }}>
                    {t('common.retry')}
                </Text>
            </Pressable>
        </View>
    );
}

export const SessionView = React.memo((props: { id: string }) => {
    const sessionId = props.id;
    const router = useRouter();
    const { session, isLoading: isEnsuringSession } = useEnsureSessionLoaded(sessionId);
    const officialResumeSession = useOfficialResumeSession(sessionId);
    const isDataReady = useIsDataReady();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const headerHeight = useHeaderHeight();
    const isTablet = useIsTablet();
    const { width: windowWidth } = useWindowDimensions();
    const fileDiffsSidebarEnabled = useSetting('fileDiffsSidebar');
    const [explorerOpen, setExplorerOpen] = React.useState(false);
    const toggleExplorer = React.useCallback(() => setExplorerOpen((v) => !v), []);
    const closeExplorer = React.useCallback(() => setExplorerOpen(false), []);

    const showSidebar = fileDiffsSidebarEnabled
        && (isRunningOnMac() || Platform.OS === 'web')
        && windowWidth >= SIDEBAR_MIN_WINDOW_WIDTH
        && isDataReady && !!session;
    // Match left sidebar width: 30% of window, clamped to 250–360px
    const sidebarWidth = Math.min(Math.max(Math.floor(windowWidth * 0.3), 250), 360);

    const [sidebarCollapsed, setSidebarCollapsed] = useLocalSettingMutable('sidebarCollapsed');
    const sidebarAnim = useSharedValue(sidebarCollapsed ? 0 : 1);

    React.useEffect(() => {
        sidebarAnim.value = withTiming(sidebarCollapsed ? 0 : 1, {
            duration: 250,
            easing: Easing.out(Easing.cubic),
        });
    }, [sidebarCollapsed]);

    const animatedSidebarStyle = useAnimatedStyle(() => ({
        width: sidebarAnim.value * sidebarWidth,
        opacity: sidebarAnim.value,
        overflow: 'hidden' as const,
    }));

    const toggleSidebar = React.useCallback(() => {
        setSidebarCollapsed(!sidebarCollapsed);
    }, [sidebarCollapsed, setSidebarCollapsed]);

    const [selectedFile, setSelectedFile] = React.useState<GitFileStatus | null>(null);
    const handleSidebarFilePress = React.useCallback((file: GitFileStatus) => {
        setSelectedFile((current) => (current?.fullPath === file.fullPath ? null : file));
    }, []);
    const clearSelectedFile = React.useCallback(() => setSelectedFile(null), []);

    // When sidebar is hidden or disabled, don't keep a stale selection.
    React.useEffect(() => {
        if (!showSidebar || sidebarCollapsed) setSelectedFile(null);
    }, [showSidebar, sidebarCollapsed]);

    // Compute header props based on session state
    const headerProps = useMemo(() => {
        if (!isDataReady) {
            return {
                title: '',
                subtitle: undefined,
                isConnected: false,
            };
        }

        if (!session) {
            return {
                title: t('errors.sessionDeleted'),
                subtitle: undefined,
                isConnected: false,
            };
        }

        const isConnected = session.presence === 'online';
        const flavor = session.metadata?.flavor;
        const agentLabel = flavor === 'codex' || flavor === 'gpt' || flavor === 'openai'
            ? t('agentInput.agent.codex')
            : t('agentInput.agent.claude');
        const lifecycleVisual = getSessionLifecycleVisual(session.metadata?.lifecycleState);
        const lifecycleStatus = lifecycleVisual ? {
            ...lifecycleVisual,
            label: t(lifecycleVisual.labelKey),
        } : undefined;
        return {
            title: officialResumeSession?.title || getSessionName(session),
            subtitle: undefined,
            agentLabel,
            isConnected: isConnected,
            tintColor: theme.colors.header.tint,
            lifecycleStatus,
        };
    }, [session, isDataReady, theme.colors.header.tint, officialResumeSession?.title]);

    const mainContent = (
        <>
            {/* Status bar shadow for landscape mode */}
            {isLandscape && deviceType === 'phone' && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: safeArea.top,
                    backgroundColor: theme.colors.surface,
                    zIndex: 1000,
                    shadowColor: theme.colors.shadow.color,
                    shadowOffset: {
                        width: 0,
                        height: 2,
                    },
                    shadowOpacity: theme.colors.shadow.opacity,
                    shadowRadius: 3,
                    elevation: 5,
                }} />
            )}

            {/* Header - always shown on desktop/Mac, hidden in landscape mode only on actual phones */}
            {!(isLandscape && deviceType === 'phone' && Platform.OS !== 'web') && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000
                }}>
                    <ChatHeaderView
                        {...headerProps}
                        onBackPress={() => {
                            // If a sidebar file is currently shown inline, first
                            // close the diff; only leave the session on the next press.
                            if (selectedFile) {
                                setSelectedFile(null);
                                return;
                            }
                            router.back();
                        }}
                        onSidebarTogglePress={showSidebar ? toggleSidebar : undefined}
                        sidebarCollapsed={sidebarCollapsed}
                        onExplorerTogglePress={isDataReady && !!session ? toggleExplorer : undefined}
                        explorerOpen={explorerOpen}
                        onDetailsPress={session ? () => router.push(`/session/${sessionId}/info`) : undefined}
                    />
                </View>
            )}

            {/* Content based on state */}
            <View style={{ flex: 1, paddingTop: !(isLandscape && deviceType === 'phone' && Platform.OS !== 'web') ? safeArea.top + headerHeight : 0 }}>
                {shouldShowSessionLoadingOverlay({ isDataReady, isEnsuringSession, hasSession: !!session }) ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                ) : !session ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                        <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16, fontWeight: '600' }}>{t('errors.sessionDeleted')}</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>{t('errors.sessionDeletedDescription')}</Text>
                    </View>
                ) : (
                    <SessionViewLoaded key={sessionId} sessionId={sessionId} session={session} />
                )}
            </View>
            {/* Directory Tree Drawer - on non-desktop it renders as RNModal internally */}
            {!showSidebar && isDataReady && session && (
                <DirectoryTreeDrawer
                    sessionId={sessionId}
                    machineId={session.metadata?.machineId}
                    sessionPath={session.metadata?.path}
                    visible={explorerOpen}
                    onClose={closeExplorer}
                />
            )}
        </>
    );

    if (!showSidebar) {
        return (
            <View role="main" style={{ flex: 1 }}>
                {mainContent}
            </View>
        );
    }

    // Desktop layout: explorer + chat + sidebar at the same level (full height).
    // When a sidebar file is selected, InlineFileDiff overlays the main content
    // (chat stays mounted underneath so state is preserved).
    return (
        <View role="main" style={{ flex: 1, flexDirection: 'row' }}>
            {/* Explorer drawer (desktop inline) */}
            {isDataReady && session && (
                <DirectoryTreeDrawer
                    sessionId={sessionId}
                    machineId={session.metadata?.machineId}
                    sessionPath={session.metadata?.path}
                    visible={explorerOpen}
                    onClose={closeExplorer}
                />
            )}
            <View style={{ flex: 1 }}>
                {mainContent}
                {selectedFile && !sidebarCollapsed && (
                    <View
                        style={{
                            pointerEvents: 'box-none' as const,
                            position: 'absolute',
                            top: safeArea.top + headerHeight,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: theme.colors.surface,
                        }}
                    >
                        <InlineFileDiff
                            sessionId={sessionId}
                            fullPath={selectedFile.fullPath}
                            status={selectedFile.status}
                            onClose={clearSelectedFile}
                        />
                    </View>
                )}
            </View>
            <Animated.View style={[{ minWidth: 0, alignSelf: 'stretch' }, animatedSidebarStyle]}>
                <View style={{ width: sidebarWidth, flex: 1 }}>
                    <FilesSidebar
                        sessionId={sessionId}
                        selectedPath={selectedFile?.fullPath ?? null}
                        onFilePress={handleSidebarFilePress}
                    />
                </View>
            </Animated.View>
        </View>
    );
});

const SIDEBAR_MIN_WINDOW_WIDTH = 1100;

function SessionViewLoaded({ sessionId, session }: { sessionId: string, session: Session }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const isTablet = useIsTablet();
    const [message, setMessage] = React.useState('');
    const [fileReferences, setFileReferences] = React.useState<string[]>([]);
    const [localFiles, setLocalFiles] = React.useState<LocalFile[]>([]);
    const [showFilePicker, setShowFilePicker] = React.useState(false);
    const chatSubmissionDeduperRef = React.useRef(createChatSubmissionDeduper());
    const { messages, isLoaded, loadError } = useSessionMessages(sessionId);
    const officialResumeSession = useOfficialResumeSession(sessionId);
    const acknowledgedCliVersions = useLocalSetting('acknowledgedCliVersions');
    const sessionInputHorizontalPadding = Platform.OS === 'web' || isRunningOnMac() || isTablet ? 12 : 8;

    // Check if CLI version is outdated and not already acknowledged
    const cliVersion = session.metadata?.version;
    const machineId = session.metadata?.machineId;
    const isCliOutdated = cliVersion && !isVersionSupported(cliVersion, MINIMUM_CLI_VERSION);
    const isAcknowledged = machineId && acknowledgedCliVersions[machineId] === cliVersion;
    const shouldShowCliWarning = isCliOutdated && !isAcknowledged;
    const flavor = session.metadata?.flavor;
    const agentType = flavor === 'codex' || flavor === 'gpt' || flavor === 'openai' ? 'codex' : 'claude';
    const availableModels = React.useMemo(() => (
        getAvailableModels(flavor, session.metadata, t)
    ), [flavor, session.metadata]);
    const availableModes = React.useMemo(() => (
        getAvailablePermissionModes(flavor, session.metadata, t)
    ), [flavor, session.metadata]);

    const permissionMode = React.useMemo<PermissionMode | null>(() => (
        resolveCurrentOption(availableModes, [
            session.permissionMode,
            session.metadata?.currentOperatingModeCode,
            getDefaultPermissionModeKey(flavor),
        ])
    ), [availableModes, session.permissionMode, session.metadata?.currentOperatingModeCode, flavor]);

    const modelMode = React.useMemo<ModelMode | null>(() => (
        resolveCurrentOption(availableModels, [
            session.modelMode,
            session.metadata?.currentModelCode,
            getDefaultModelKey(flavor),
        ])
    ), [availableModels, session.modelMode, session.metadata?.currentModelCode, flavor]);

    // Effort level state
    const modelKey = modelMode?.key ?? 'default';
    const availableEffortLevels = React.useMemo<EffortLevel[]>(() => (
        getEffortLevelsForModel(flavor, modelKey, t, availableModels)
    ), [flavor, modelKey, availableModels]);
    const effortLevel = React.useMemo<EffortLevel | null>(() => (
        resolveCurrentOption(availableEffortLevels, [
            session.effortLevel,
            getDefaultEffortKeyForModel(flavor, modelKey, availableModels),
        ])
    ), [availableEffortLevels, session.effortLevel, flavor, modelKey, availableModels]);

    const sessionStatus = useSessionStatus(session);
    const sessionUsage = useSessionUsage(sessionId);
    const alwaysShowContextSize = useSetting('alwaysShowContextSize');
    const expResumeSession = useSetting('expResumeSession');
    const { canResume, resumeSession, resumingSession } = useSessionQuickActions(session);
    const isArchivedSession = session.metadata?.lifecycleState === 'archived';
    const isDisconnected = !sessionStatus.isConnected;
    const isInactiveArchivedSession = isArchivedSession && isDisconnected;
    const resumeCommandBlock = getResumeCommandBlock(session);
    const visibleAgentGoal = React.useMemo(() => (
        resolveVisibleAgentGoalStatus(session)
    ), [
        session.agentState?.agentGoalStatus,
        session.presence,
        session.metadata?.claudeSessionId,
        session.metadata?.codexThreadId,
    ]);
    const [goalActionInFlight, setGoalActionInFlight] = React.useState<AgentGoalAction | null>(null);
    const isOfficialResumePending = !!officialResumeSession;

    React.useEffect(() => {
        const currentState = storage.getState();
        const hasUnviewedCompletion = (
            currentState.sessionUnviewedCompletionAt[sessionId] ?? 0
        ) > (
            currentState.sessionLastViewedAt[sessionId] ?? 0
        );

        if (shouldMarkVisibleSessionCompletionViewed({
            state: sessionStatus.state,
            hasUnviewedCompletion,
        })) {
            currentState.markSessionViewed(sessionId);
        }
    }, [sessionId, sessionStatus.state, session.updatedAt, session.thinking]);

    React.useEffect(() => {
        if (!officialResumeSession) {
            return;
        }
        const now = Date.now();
        if (!shouldKeepOfficialResumePending({
            startedAt: officialResumeSession.startedAt,
            now,
            messagesLoaded: isLoaded,
        })) {
            storage.getState().clearOfficialResumeSession(sessionId);
            return;
        }

        const remainingMs = Math.max(0, OFFICIAL_RESUME_PENDING_TIMEOUT_MS - (now - officialResumeSession.startedAt));
        const timer = setTimeout(() => {
            storage.getState().clearOfficialResumeSession(sessionId);
        }, remainingMs);
        return () => clearTimeout(timer);
    }, [isLoaded, officialResumeSession, sessionId]);
    const handleGoalAction = React.useCallback(async (action: AgentGoalAction) => {
        await performAgentGoalAction({
            action,
            currentGoalText: visibleAgentGoal?.text ?? '',
            promptEditGoal: (currentGoalText) => Modal.prompt(t('components.agentGoalBar.editGoal'), undefined, {
                placeholder: t('components.agentGoalBar.currentGoal'),
                defaultValue: currentGoalText,
                cancelText: t('common.cancel'),
                confirmText: t('common.save'),
            }),
            dispatchGoalAction: (nextAction, objective) => sessionGoalAction(sessionId, nextAction, objective),
            setInFlight: setGoalActionInFlight,
            onError: (error) => console.error('Failed to perform goal action', error),
        });
    }, [sessionId, visibleAgentGoal?.text]);

    // Use draft hook for auto-saving message drafts
    const { clearDraft } = useDraft(sessionId, message, setMessage);

    // Handle dismissing CLI version warning
    const handleDismissCliWarning = React.useCallback(() => {
        if (machineId && cliVersion) {
            storage.getState().applyLocalSettings({
                acknowledgedCliVersions: {
                    ...acknowledgedCliVersions,
                    [machineId]: cliVersion
                }
            });
        }
    }, [machineId, cliVersion, acknowledgedCliVersions]);

    // Function to update permission mode
    const updatePermissionMode = React.useCallback((mode: PermissionMode) => {
        storage.getState().updateSessionPermissionMode(sessionId, mode.key);
        // If the agent is mid-turn, push the change to the live query so it takes
        // effect immediately instead of only on the next message. Fire-and-forget;
        // idle/local sessions have no handler and it no-ops.
        const current = storage.getState().sessions[sessionId];
        if (current?.active && current?.thinking) {
            void sessionPermissionMode(sessionId, mode.key);
        }
    }, [sessionId]);

    const updateModelMode = React.useCallback((mode: ModelMode) => {
        storage.getState().updateSessionModelMode(sessionId, mode.key);
    }, [sessionId]);

    const updateEffortLevel = React.useCallback((level: EffortLevel) => {
        storage.getState().updateSessionEffortLevel(sessionId, level.key);
    }, [sessionId]);

    // Memoize header-dependent styles to prevent re-renders
    const headerDependentStyles = React.useMemo(() => ({
        contentContainer: {
            flex: 1
        },
        flatListStyle: {
            marginTop: 0 // No marginTop needed since header is handled by parent
        },
    }), []);


    // Trigger session visibility and initialize git status sync
    React.useLayoutEffect(() => {

        storage.getState().markSessionViewed(sessionId);

        // Trigger session sync
        sync.onSessionVisible(sessionId);


        // Initialize git status sync for this session
        gitStatusSync.getSync(sessionId);
    }, [sessionId]);

    let content = (
        <>
            <Deferred>
                {messages.length > 0 && (
                    <ChatList session={session} />
                )}
            </Deferred>
        </>
    );
    const messagePlaceholder = resolveSessionMessagePlaceholder({
        messageCount: messages.length,
        isLoaded,
        loadError,
    });
    const placeholder = messagePlaceholder === 'empty' ? (
        <EmptyMessages session={session} />
    ) : messagePlaceholder === 'loading' ? (
        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
    ) : messagePlaceholder === 'timeout' || messagePlaceholder === 'network' ? (
        <SessionMessageLoadErrorView
            error={messagePlaceholder}
            onRetry={() => sync.retryMessages(sessionId)}
        />
    ) : null;

    const composer = (
        <AgentInput
            placeholder={t('session.inputPlaceholder')}
            value={message}
            onChangeText={setMessage}
            sessionId={sessionId}
            permissionMode={permissionMode}
            onPermissionModeChange={updatePermissionMode}
            availableModes={availableModes}
            modelMode={modelMode}
            availableModels={availableModels}
            onModelModeChange={updateModelMode}
            effortLevel={effortLevel}
            availableEffortLevels={availableEffortLevels}
            onEffortLevelChange={updateEffortLevel}
            metadata={session.metadata}
            agentType={agentType}
            connectionStatus={{
                text: sessionStatus.statusText,
                color: sessionStatus.state === 'disconnected' ? theme.colors.textSecondary : sessionStatus.state === 'waiting' ? theme.colors.success : sessionStatus.statusColor,
                dotColor: sessionStatus.state === 'disconnected' ? theme.colors.textSecondary : sessionStatus.state === 'waiting' ? theme.colors.success : sessionStatus.statusDotColor,
                isPulsing: sessionStatus.isPulsing
            }}
            blockSend={false}
            onSend={() => {
                if (message.trim() || localFiles.length > 0) {
                    const hasRefs = fileReferences.length > 0;
                    const hasLocalImages = localFiles.some(f => f.mimeType.startsWith('image/'));
                    const hasLocalTextFiles = localFiles.some(f => !f.mimeType.startsWith('image/'));

                    let textToSend = message;
                    if (hasRefs) {
                        textToSend = `<file-references>\n${fileReferences.join('\n')}\n</file-references>\n\n${textToSend}`;
                    }
                    if (hasLocalTextFiles) {
                        const textFileContents = localFiles
                            .filter(f => !f.mimeType.startsWith('image/'))
                            .map(f => `<local-file name="${f.name}">\n${f.data}\n</local-file>`)
                            .join('\n\n');
                        textToSend = `${textFileContents}\n\n${textToSend}`;
                    }

                    const displayText = (hasRefs || hasLocalTextFiles) ? message : undefined;
                    const images = hasLocalImages
                        ? localFiles.filter(f => f.mimeType.startsWith('image/')).map(f => ({
                            data: f.data,
                            mimeType: f.mimeType,
                            name: f.name,
                            width: f.width,
                            height: f.height,
                        }))
                        : undefined;

                    if (!chatSubmissionDeduperRef.current.accept({
                        sessionId,
                        text: textToSend,
                        displayText,
                        fileReferences,
                        localFiles: localFiles.map((file) => ({
                            name: file.name,
                            mimeType: file.mimeType,
                            size: file.size,
                            data: file.data,
                        })),
                    })) {
                        return;
                    }

                    setMessage('');
                    setFileReferences([]);
                    setLocalFiles([]);
                    clearDraft();
                    sync.sendMessage(sessionId, textToSend, {
                        source: 'chat',
                        displayText,
                        fileReferences: hasRefs ? fileReferences : undefined,
                        images,
                    });
                }
            }}
            onAbort={isDisconnected || isOfficialResumePending ? undefined : () => sessionAbort(sessionId)}
            showAbortButton={!isOfficialResumePending && (sessionStatus.state === 'thinking' || sessionStatus.state === 'waiting')}
            onFileViewerPress={!isOfficialResumePending ? () => router.push(`/session/${sessionId}/files`) : undefined}
            autocompletePrefixes={['@', '/']}
            autocompleteSuggestions={(query) => getSuggestions(sessionId, query, { hideCompact: true })}
            usageData={sessionUsage ? {
                inputTokens: sessionUsage.inputTokens,
                outputTokens: sessionUsage.outputTokens,
                cacheCreation: sessionUsage.cacheCreation,
                cacheRead: sessionUsage.cacheRead,
                contextSize: sessionUsage.contextSize,
                ...(sessionUsage.contextWindow !== undefined ? { contextWindow: sessionUsage.contextWindow } : {})
            } : session.latestUsage ? {
                inputTokens: session.latestUsage.inputTokens,
                outputTokens: session.latestUsage.outputTokens,
                cacheCreation: session.latestUsage.cacheCreation,
                cacheRead: session.latestUsage.cacheRead,
                contextSize: session.latestUsage.contextSize,
                ...(session.latestUsage.contextWindow !== undefined ? { contextWindow: session.latestUsage.contextWindow } : {})
            } : undefined}
            alwaysShowContextSize={alwaysShowContextSize}
            fileReferences={fileReferences}
            onFileReferencesChange={setFileReferences}
            onFilePickerOpen={() => setShowFilePicker(true)}
            localFiles={localFiles}
            onLocalFileRemove={(index) => {
                setLocalFiles(prev => prev.filter((_, i) => i !== index));
            }}
            onLocalFilePick={async () => {
                try {
                    const { launchImageLibraryAsync, MediaTypeOptions } = await import('expo-image-picker');
                    const result = await launchImageLibraryAsync({
                        mediaTypes: MediaTypeOptions.Images,
                        quality: 0.8,
                        base64: true,
                    });
                    if (!result.canceled && result.assets.length > 0) {
                        const newFiles: LocalFile[] = result.assets.map(asset => ({
                            name: asset.fileName || `image_${Date.now()}.jpg`,
                            mimeType: asset.mimeType || 'image/jpeg',
                            data: asset.base64 || '',
                            size: asset.fileSize || 0,
                            width: asset.width,
                            height: asset.height,
                            uri: asset.uri,
                        }));
                        setLocalFiles(prev => [...prev, ...newFiles]);
                    }
                } catch (e) {
                    console.error('Failed to pick local file:', e);
                }
            }}
            onSlashCommandSelect={(command) => {
                if (isOfficialResumePending) return;
                setMessage(prev => prev + command + ' ');
            }}
            hideCompactCommand
            onCompactPress={async () => {
                if (isOfficialResumePending) return;
                const confirmed = await Modal.confirm(
                    t('agentInput.context.compactConfirmTitle'),
                    t('agentInput.context.compactConfirmMessage'),
                    {
                        cancelText: t('common.cancel'),
                        confirmText: t('agentInput.context.compactConfirmAction'),
                    },
                );
                if (!confirmed) {
                    return;
                }
                sync.sendMessage(sessionId, '/compact', { source: 'chat' });
            }}
        />
    );

    const archivedHint = isInactiveArchivedSession ? (
        <CenteredInputWidth horizontalPadding={sessionInputHorizontalPadding}>
            <InactiveArchivedHint
                resumeCommandBlock={expResumeSession ? resumeCommandBlock : null}
                canResume={canResume}
                resuming={resumingSession}
                onResume={resumeSession}
            />
        </CenteredInputWidth>
    ) : null;

    const input = isInactiveArchivedSession ? (
        <>
            {archivedHint}
            {composer}
        </>
    ) : (
        <>
            {expResumeSession && isDisconnected && resumeCommandBlock && (
                <CenteredInputWidth horizontalPadding={sessionInputHorizontalPadding}>
                    <ResumeCommandHint resumeCommandBlock={resumeCommandBlock} />
                </CenteredInputWidth>
            )}
            {visibleAgentGoal && (
                <CenteredInputWidth horizontalPadding={sessionInputHorizontalPadding}>
                    <AgentGoalBar
                        goal={visibleAgentGoal}
                        onAction={handleGoalAction}
                        inFlightAction={goalActionInFlight}
                    />
                </CenteredInputWidth>
            )}
            {composer}
        </>
    );


    return (
        <>
            {/* CLI Version Warning Overlay - Subtle centered pill */}
            {shouldShowCliWarning && !(isLandscape && deviceType === 'phone') && (
                <Pressable
                    onPress={handleDismissCliWarning}
                    style={{
                        position: 'absolute',
                        top: 8, // Position at top of content area (padding handled by parent)
                        alignSelf: 'center',
                        backgroundColor: '#FFF3CD',
                        borderRadius: 100, // Fully rounded pill
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        zIndex: 998,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        elevation: 4,
                    }}
                >
                    <Ionicons name="warning-outline" size={14} color="#FF9500" style={{ marginRight: 6 }} />
                    <Text style={{
                        fontSize: 12,
                        color: '#856404',
                        fontWeight: '600'
                    }}>
                        {t('sessionInfo.cliVersionOutdated')}
                    </Text>
                    <Ionicons name="close" size={14} color="#856404" style={{ marginLeft: 8 }} />
                </Pressable>
            )}

            {/* Main content area - no padding since header is overlay */}
            <View style={{ flexBasis: 0, flexGrow: 1, paddingBottom: safeArea.bottom + ((isRunningOnMac() || Platform.OS === 'web') ? 8 : 0) }}>
                <AgentContentView
                    content={content}
                    input={input}
                    placeholder={placeholder}
                />
                {isOfficialResumePending && (
                    <View style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: `${theme.colors.surface}EE`,
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingHorizontal: 28,
                        gap: 14,
                        zIndex: 30,
                    }}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
                            {t('session.importOfficialTitle')}
                        </Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>
                            {t('session.importOfficialDescription')}
                        </Text>
                        <View style={{
                            width: '100%',
                            maxWidth: 280,
                            height: 6,
                            borderRadius: 999,
                            overflow: 'hidden',
                            backgroundColor: theme.colors.surfaceHigh,
                        }}>
                            <View style={{
                                width: '70%',
                                height: '100%',
                                borderRadius: 999,
                                backgroundColor: theme.colors.textSecondary,
                            }} />
                        </View>
                    </View>
                )}
            </View >

            {/* Back button for landscape phone mode when header is hidden */}
            {
                isLandscape && deviceType === 'phone' && (
                    <Pressable
                        onPress={() => router.back()}
                        style={{
                            position: 'absolute',
                            top: safeArea.top + 8,
                            left: 16,
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: `rgba(${theme.dark ? '28, 23, 28' : '255, 255, 255'}, 0.9)`,
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...Platform.select({
                                ios: {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 4,
                                },
                                android: {
                                    elevation: 2,
                                }
                            }),
                        }}
                        hitSlop={15}
                    >
                        <Ionicons
                            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                            size={Platform.select({ ios: 28, default: 24 })}
                            color={theme.colors.header.tint}
                        />
                    </Pressable>
                )
            }

            {/* File reference picker modal */}
            <RNModal
                visible={showFilePicker}
                animationType="slide"
                presentationStyle={Platform.OS === 'ios' ? 'formSheet' : undefined}
                onRequestClose={() => setShowFilePicker(false)}
            >
                <FileReferencePicker
                    sessionId={sessionId}
                    selectedPaths={new Set(fileReferences)}
                    onConfirm={(paths) => {
                        setFileReferences(Array.from(paths));
                        setShowFilePicker(false);
                    }}
                    onDismiss={() => setShowFilePicker(false)}
                />
            </RNModal>
        </>
    )
}

function ResumeCommandHint({ resumeCommandBlock }: {
    resumeCommandBlock: NonNullable<ReturnType<typeof getResumeCommandBlock>>;
}) {
    const { theme } = useUnistyles();

    return (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8 }}>
            <ResumeCommandCopyBlock resumeCommandBlock={resumeCommandBlock} />
            <Text style={{
                color: theme.colors.textSecondary,
                fontSize: 12,
                lineHeight: 16,
                textAlign: 'center',
                paddingHorizontal: 8,
            }}>
                Run this command in your terminal to resume this session
            </Text>
        </View>
    );
}

function InactiveArchivedHint(props: {
    resumeCommandBlock: NonNullable<ReturnType<typeof getResumeCommandBlock>> | null;
    canResume: boolean;
    resuming: boolean;
    onResume: () => void;
}) {
    const { theme } = useUnistyles();
    const hintTextStyle = {
        color: theme.colors.agentEventText,
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'left' as const,
    };

    return (
        <View style={{
            paddingTop: 12,
            paddingBottom: 10,
            gap: 10,
            alignItems: 'stretch',
        }}>
            <View style={{ paddingHorizontal: 8, gap: 4 }}>
                <Text style={hintTextStyle}>
                    {t('session.inactiveArchived')}
                </Text>
                {props.canResume ? null : props.resumeCommandBlock && (
                    <Text style={hintTextStyle}>
                        {t('session.resumeFromTerminal')}
                    </Text>
                )}
            </View>
            {props.canResume ? (
                <Pressable
                    onPress={props.onResume}
                    disabled={props.resuming}
                    style={({ pressed }) => ({
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: theme.colors.button.primary.background,
                        opacity: props.resuming ? 0.6 : pressed ? 0.8 : 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginHorizontal: 8,
                    })}
                >
                    {props.resuming ? (
                        <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                    ) : (
                        <Text style={{ color: theme.colors.button.primary.tint, fontSize: 15, fontWeight: '600' }}>
                            {t('sessionInfo.resumeSession')}
                        </Text>
                    )}
                </Pressable>
            ) : props.resumeCommandBlock && (
                <ResumeCommandCopyBlock resumeCommandBlock={props.resumeCommandBlock} />
            )}
        </View>
    );
}

function ResumeCommandCopyBlock({ resumeCommandBlock }: {
    resumeCommandBlock: NonNullable<ReturnType<typeof getResumeCommandBlock>>;
}) {
    const { theme } = useUnistyles();
    const [copied, setCopied] = React.useState(false);

    return (
        <Pressable
            onPress={async () => {
                await Clipboard.setStringAsync(resumeCommandBlock.copyText);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }}
            style={{
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: theme.colors.surfaceHigh,
                flexDirection: 'row',
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 12,
                alignItems: 'flex-start',
            }}
        >
            <View style={{ flex: 1 }}>
                {resumeCommandBlock.lines.map((line, index) => (
                    <Text
                        key={`${line}-${index}`}
                        style={{
                            color: theme.colors.text,
                            fontSize: 13,
                            lineHeight: 18,
                            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                        }}
                    >
                        {line}
                    </Text>
                ))}
            </View>
            <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={16}
                color={copied ? '#30D158' : theme.colors.textSecondary}
                style={{ marginTop: 1 }}
            />
        </Pressable>
    );
}

function CenteredInputWidth(props: {
    children: React.ReactNode;
    horizontalPadding: number;
}) {
    return (
        <View style={{
            width: '100%',
            paddingHorizontal: props.horizontalPadding,
            alignItems: 'center',
        }}>
            <View style={{
                width: '100%',
                maxWidth: layout.maxWidth,
            }}>
                {props.children}
            </View>
        </View>
    );
}
