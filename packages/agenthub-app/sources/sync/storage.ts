import { create } from "zustand";
import { useShallow } from 'zustand/react/shallow'
import equal from 'fast-deep-equal'
import React from "react";
import { Session, Machine, GitStatus, MachineMetadata } from "./storageTypes";
import type { GitStatusFiles } from "./gitStatusFiles";
import { createReducer, reducer, ReducerState } from "./reducer/reducer";
import { Message } from "./typesMessage";
import { NormalizedMessage } from "./typesRaw";
import { applySettings, Settings, settingsDefaults } from "./settings";
import { LocalSettings, applyLocalSettings } from "./localSettings";
import { Purchases, purchasesDefaults } from "./purchases";
import { Profile, profileDefaults } from "./profile";
import { loadSettings, loadLocalSettings, saveLocalSettings, saveSettings, loadPurchases, savePurchases, loadProfile, saveProfile, loadSessionDrafts, saveSessionDrafts, loadSessionPermissionModes, saveSessionPermissionModes, loadSessionModelModes, saveSessionModelModes, loadSessionEffortLevels, saveSessionEffortLevels, loadSessionLastViewedAt, saveSessionLastViewedAt, loadSessionUnviewedCompletionAt, saveSessionUnviewedCompletionAt, loadSessionLastViewedState, saveSessionLastViewedState } from "./persistence";
import type { PermissionModeKey } from '@/utils/permissionMode';
import { sync } from "./sync";
import { isMutableTool } from "@/components/tools/knownTools";
import { projectManager } from "./projectManager";
import { DecryptedArtifact } from "./artifactTypes";
import { buildProjectListViewData, buildSessionListViewData, buildSessionRowData, isSandboxEnabled, isSessionActive, resolveSessionOnlineState } from "./storageProjection";
import type { ProjectListViewItem, SessionListItem, SessionListViewItem } from "./storageProjection";
import type { SessionState } from "@/utils/sessionUtils";
import type { LatestSessionUsage } from "./sessionUsage";
import type { OfficialCodexThread } from './officialThreads';
import { applyBoundedFilePreviewCache, isFilePreviewCacheEntryFresh, touchFilePreviewCache, type FilePreviewCache } from './filePreviewCachePolicy';
import { countRunningToolsInMessages, mergeMessagesNewestFirst, selectRetainedSessionMessageIds, updateRunningToolCount } from './sessionMessageIndex';
import type { SessionMessageLoadError } from './sessionMessageLoadState';
import { isTopLevelSession, selectSideChatSessions } from './sideChatSessions';
export type { ProjectGroupData, ProjectListViewItem, SessionListItem, SessionListViewItem, SessionRowData } from "./storageProjection";

function useDeepEqual<T>(selector: (state: StorageState) => T): (state: StorageState) => T {
    const prev = React.useRef<T>(undefined);
    return (state: StorageState) => {
        const next = selector(state);
        return equal(prev.current, next) ? prev.current! : (prev.current = next);
    };
}

interface SessionMessages {
    messages: Message[];
    messagesMap: Record<string, Message>;
    runningToolCount: number;
    reducerState: ReducerState;
    isLoaded: boolean;
    hasMoreBefore: boolean;
    isLoadingBefore: boolean;
    loadError: SessionMessageLoadError | null;
}

const MAX_RETAINED_INACTIVE_SESSION_MESSAGES = 20;
const LOCAL_ARCHIVE_LIFECYCLE_STATES = new Set([
    'archiveRequested',
    'exited',
    'timeout',
    'not-found',
    'archived',
]);

type SessionInput = Omit<Session, 'presence'> & { presence?: 'online' | number };

function boundSessionMessages(
    sessions: Readonly<Record<string, Session>>,
    sessionMessages: Readonly<Record<string, SessionMessages>>,
): Record<string, SessionMessages> {
    const retainedMessageIds = selectRetainedSessionMessageIds(
        Object.fromEntries(Object.entries(sessions).map(([id, session]) => [id, {
            active: isSessionActive(session),
            updatedAt: session.updatedAt,
        }])),
        Object.keys(sessionMessages),
        MAX_RETAINED_INACTIVE_SESSION_MESSAGES,
    );
    return Object.fromEntries(
        Object.entries(sessionMessages).filter(([id]) => retainedMessageIds.has(id)),
    );
}

function applyBoundedSessionMessageUpdate(
    sessions: Readonly<Record<string, Session>>,
    sessionMessages: Readonly<Record<string, SessionMessages>>,
    sessionId: string,
    nextSessionMessages: SessionMessages,
): Record<string, SessionMessages> {
    const updatedSessionMessages = {
        ...sessionMessages,
        [sessionId]: nextSessionMessages,
    };
    const session = sessions[sessionId];
    if (!session || isSessionActive(session)) {
        return updatedSessionMessages;
    }
    return boundSessionMessages(sessions, updatedSessionMessages);
}

function preserveNewerLocalArchiveProjection(existing: Session | undefined, incoming: SessionInput): SessionInput {
    const existingState = existing?.metadata?.lifecycleState;
    if (!existing || !existingState || !LOCAL_ARCHIVE_LIFECYCLE_STATES.has(existingState)) {
        return incoming;
    }

    const existingSince = existing.metadata?.lifecycleStateSince ?? existing.updatedAt;
    const incomingSince = incoming.metadata?.lifecycleStateSince ?? incoming.updatedAt;
    if (existingSince < incomingSince) {
        return incoming;
    }

    return {
        ...incoming,
        active: existing.active,
        activeAt: existing.activeAt,
        thinking: existing.thinking,
        thinkingAt: existing.thinkingAt,
        metadata: incoming.metadata
            ? {
                ...incoming.metadata,
                lifecycleState: existingState,
                lifecycleStateSince: existing.metadata?.lifecycleStateSince ?? existingSince,
                ...(existing.metadata?.archivedBy ? { archivedBy: existing.metadata.archivedBy } : {}),
                ...(existing.metadata?.archiveReason ? { archiveReason: existing.metadata.archiveReason } : {}),
            }
            : existing.metadata,
    };
}

interface StorageState {
    settings: Settings;
    settingsVersion: number | null;
    localSettings: LocalSettings;
    purchases: Purchases;
    profile: Profile;
    sessions: Record<string, Session>;
    sessionsData: SessionListItem[] | null;  // Legacy - to be removed
    sessionListViewData: SessionListViewItem[] | null;
    projectListViewData: ProjectListViewItem[] | null;
    officialCodexThreads: Record<string, OfficialCodexThread[]>;
    sessionLastViewedAt: Record<string, number>;
    sessionLastViewedState: Record<string, string>;
    sessionUnviewedCompletionAt: Record<string, number>;
    sessionMessages: Record<string, SessionMessages>;
    sessionGitStatus: Record<string, GitStatus | null>;
    sessionGitStatusFiles: Record<string, GitStatusFiles | null>;
    sessionFileCache: FilePreviewCache;
    machines: Record<string, Machine>;
    artifacts: Record<string, DecryptedArtifact>;  // New artifacts storage
    socketStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    socketLastConnectedAt: number | null;
    socketLastDisconnectedAt: number | null;
    isDataReady: boolean;
    nativeUpdateStatus: { available: boolean; updateUrl?: string } | null;
    officialResumeSessions: Record<string, { threadId: string; startedAt: number; title?: string | null }>;
    resetAccountState: () => void;
    applySessions: (sessions: (Omit<Session, 'presence'> & { presence?: "online" | number })[], replace?: boolean) => void;
    applyMachines: (machines: Machine[], replace?: boolean) => void;
    deleteMachine: (machineId: string) => void;
    applyLoaded: () => void;
    applyReady: () => void;
    applyMessages: (sessionId: string, messages: NormalizedMessage[]) => { changed: string[], hasReadyEvent: boolean };
    applyMessagesLoaded: (sessionId: string) => void;
    applyMessagesLoadError: (sessionId: string, error: SessionMessageLoadError | null) => void;
    applyMessageHistoryState: (sessionId: string, state: Partial<Pick<SessionMessages, 'hasMoreBefore' | 'isLoadingBefore'>>) => void;
    applySettings: (settings: Settings, version: number) => void;
    applySettingsLocal: (settings: Partial<Settings>) => void;
    applyLocalSettings: (settings: Partial<LocalSettings>) => void;
    applyProfile: (profile: Profile) => void;
    applySessionUsage: (sessionId: string, usage: LatestSessionUsage) => void;
    applyGitStatus: (sessionId: string, status: GitStatus | null) => void;
    applyGitStatusFiles: (sessionId: string, files: GitStatusFiles | null) => void;
    applyFileCache: (sessionId: string, filePath: string, content: string | null, diff: string | null, isBinary: boolean, totalSize?: number, truncated?: boolean, version?: string) => void;
    touchFileCache: (sessionId: string, filePath: string) => void;
    applyNativeUpdateStatus: (status: { available: boolean; updateUrl?: string } | null) => void;
    isMutableToolCall: (sessionId: string, callId: string) => boolean;
    setSocketStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
    getActiveSessions: () => Session[];
    updateSessionDraft: (sessionId: string, draft: string | null) => void;
    updateSessionPermissionMode: (sessionId: string, mode: string) => void;
    updateSessionModelMode: (sessionId: string, mode: string) => void;
    updateSessionEffortLevel: (sessionId: string, level: string) => void;
    markSessionViewed: (sessionId: string) => void;
    // Artifact methods
    applyArtifacts: (artifacts: DecryptedArtifact[]) => void;
    addArtifact: (artifact: DecryptedArtifact) => void;
    updateArtifact: (artifact: DecryptedArtifact) => void;
    deleteArtifact: (artifactId: string) => void;
    deleteSession: (sessionId: string) => void;
    // Project management methods
    getProjects: () => import('./projectManager').Project[];
    getProject: (projectId: string) => import('./projectManager').Project | null;
    getProjectForSession: (sessionId: string) => import('./projectManager').Project | null;
    getProjectSessions: (projectId: string) => string[];
    // Project git status methods
    getProjectGitStatus: (projectId: string) => import('./storageTypes').GitStatus | null;
    getSessionProjectGitStatus: (sessionId: string) => import('./storageTypes').GitStatus | null;
    updateSessionProjectGitStatus: (sessionId: string, status: import('./storageTypes').GitStatus | null) => void;
    applyOfficialCodexThreads: (machineId: string, threads: OfficialCodexThread[]) => void;
    startOfficialResumeSession: (sessionId: string, threadId: string, title?: string | null) => void;
    clearOfficialResumeSession: (sessionId: string) => void;
}

export const storage = create<StorageState>()((set, get) => {
    let { settings, version } = loadSettings();
    let localSettings = loadLocalSettings();
    let purchases = loadPurchases();
    let profile = loadProfile();
    let sessionDrafts = loadSessionDrafts();
    let sessionPermissionModes = loadSessionPermissionModes();
    let sessionModelModes = loadSessionModelModes();
    let sessionEffortLevels = loadSessionEffortLevels();
    let sessionLastViewedAt = loadSessionLastViewedAt();
    let sessionLastViewedState = loadSessionLastViewedState();
    let sessionUnviewedCompletionAt = loadSessionUnviewedCompletionAt();
    const busySessionStates = new Set<SessionState>(['thinking', 'permission_required']);
    const buildViewStateMap = (
        lastViewedAt: Record<string, number>,
        unviewedCompletionAt: Record<string, number>,
    ) => ({
        sessionLastViewedAt: lastViewedAt,
        sessionUnviewedCompletionAt: unviewedCompletionAt,
    });
    const buildCurrentViewStateMap = (state: Pick<StorageState, 'sessionLastViewedAt' | 'sessionUnviewedCompletionAt'>) => (
        buildViewStateMap(state.sessionLastViewedAt, state.sessionUnviewedCompletionAt)
    );
    const buildMachineMetadataMap = (machines: Record<string, Machine>) => {
        const machineMetadataMap = new Map<string, MachineMetadata>();
        Object.values(machines).forEach(machine => {
            if (machine.metadata) {
                machineMetadataMap.set(machine.id, machine.metadata);
            }
        });
        return machineMetadataMap;
    };
    const syncProjectManagerSessions = (sessions: Record<string, Session>, machines: Record<string, Machine>) => {
        projectManager.updateSessions(Object.values(sessions).filter(isTopLevelSession), buildMachineMetadataMap(machines));
    };
    const rebuildProjectListViewData = (
        sessions: Record<string, Session>,
        machines: Record<string, Machine>,
        currentSettings: Settings,
        officialCodexThreads: Record<string, OfficialCodexThread[]>,
        lastViewedAt: Record<string, number>,
        unviewedCompletionAt: Record<string, number>,
    ) => buildProjectListViewData(
        sessions,
        machines,
        currentSettings.projectCustomizations,
        (sid) => projectManager.getSessionProjectGitStatus(sid),
        currentSettings.hideInactiveSessions,
        Object.values(officialCodexThreads).flat(),
        buildViewStateMap(lastViewedAt, unviewedCompletionAt),
    );
    return {
        settings,
        settingsVersion: version,
        localSettings,
        purchases,
        profile,
        sessions: {},
        machines: {},
        artifacts: {},  // Initialize artifacts
        sessionsData: null,  // Legacy - to be removed
        sessionListViewData: null,
        projectListViewData: null,
        officialCodexThreads: {},
        sessionLastViewedAt,
        sessionLastViewedState,
        sessionUnviewedCompletionAt,
        sessionMessages: {},
        sessionGitStatus: {},
        sessionGitStatusFiles: {},
        sessionFileCache: {},
        socketStatus: 'disconnected',
        socketLastConnectedAt: null,
        socketLastDisconnectedAt: null,
        isDataReady: false,
        nativeUpdateStatus: null,
        officialResumeSessions: {},
        resetAccountState: () => {
            sessionDrafts = {};
            sessionPermissionModes = {};
            sessionModelModes = {};
            sessionEffortLevels = {};
            sessionLastViewedAt = {};
            sessionLastViewedState = {};
            sessionUnviewedCompletionAt = {};
            purchases = { ...purchasesDefaults, activeSubscriptions: [], entitlements: {} };
            profile = { ...profileDefaults };
            projectManager.clear();

            set((state) => ({
                ...state,
                settings: {
                    ...settingsDefaults,
                    recentMachinePaths: [],
                    dismissedCLIWarnings: { perMachine: {}, global: {} },
                    machineGroups: {},
                    machineGroupOrder: [],
                    projectCustomizations: {},
                },
                settingsVersion: null,
                purchases,
                profile,
                sessions: {},
                machines: {},
                artifacts: {},
                sessionsData: null,
                sessionListViewData: null,
                projectListViewData: null,
                officialCodexThreads: {},
                sessionLastViewedAt: {},
                sessionLastViewedState: {},
                sessionUnviewedCompletionAt: {},
                sessionMessages: {},
                sessionGitStatus: {},
                sessionGitStatusFiles: {},
                sessionFileCache: {},
                socketStatus: 'disconnected',
                socketLastConnectedAt: null,
                socketLastDisconnectedAt: null,
                isDataReady: false,
                nativeUpdateStatus: null,
                officialResumeSessions: {},
            }));
        },
        isMutableToolCall: (sessionId: string, callId: string) => {
            const sessionMessages = get().sessionMessages[sessionId];
            if (!sessionMessages) {
                return true;
            }
            const toolCall = sessionMessages.reducerState.toolIdToMessageId.get(callId);
            if (!toolCall) {
                return true;
            }
            const toolCallMessage = sessionMessages.messagesMap[toolCall];
            if (!toolCallMessage || toolCallMessage.kind !== 'tool-call') {
                return true;
            }
            return toolCallMessage.tool?.name ? isMutableTool(toolCallMessage.tool?.name) : true;
        },
        getActiveSessions: () => {
            const state = get();
            return Object.values(state.sessions).filter(s => s.active);
        },
        applySessions: (sessions: (Omit<Session, 'presence'> & { presence?: "online" | number })[], replace = false) => set((state) => {
            // Load drafts and permission modes if sessions are empty (initial load)
            const isInitialLoad = Object.keys(state.sessions).length === 0;
            const savedDrafts = isInitialLoad ? sessionDrafts : {};
            const savedPermissionModes = isInitialLoad ? sessionPermissionModes : {};
            const savedModelModes = isInitialLoad ? sessionModelModes : {};
            const savedEffortLevels = isInitialLoad ? sessionEffortLevels : {};

            // `/v1/sessions` returns the authoritative session snapshot for the account.
            // Incremental socket/API updates still pass a single session and must merge.
            // Keep local-only fields from existing sessions in both modes.
            const mergedSessions: Record<string, Session> = replace ? {} : { ...state.sessions };
            const nextSessionUnviewedCompletionAt = { ...state.sessionUnviewedCompletionAt };
            let didChangeUnviewedCompletionAt = false;

            // Update sessions with calculated presence using centralized resolver
            sessions.forEach(session => {
                // Use centralized resolver for consistent state management
                const presence = resolveSessionOnlineState(session);

                // Preserve existing draft and permission mode if they exist, or load from saved data
                const existingDraft = state.sessions[session.id]?.draft;
                const savedDraft = savedDrafts[session.id];
                const existingPermissionMode = state.sessions[session.id]?.permissionMode;
                const savedPermissionMode = savedPermissionModes[session.id];
                const defaultPermissionMode: PermissionModeKey = isSandboxEnabled(session.metadata) ? 'bypassPermissions' : 'default';
                const resolvedPermissionMode: PermissionModeKey =
                    (existingPermissionMode && existingPermissionMode !== 'default' ? existingPermissionMode : undefined) ||
                    (savedPermissionMode && savedPermissionMode !== 'default' ? savedPermissionMode : undefined) ||
                    (session.permissionMode && session.permissionMode !== 'default' ? session.permissionMode : undefined) ||
                    defaultPermissionMode;

                // Restore model mode / effort level from MMKV on first load — server
                // does not sync these, and they used to reset on every app restart (#1028).
                const existingModelMode = state.sessions[session.id]?.modelMode;
                const resolvedModelMode = existingModelMode ?? savedModelModes[session.id] ?? session.modelMode ?? null;
                const existingEffortLevel = state.sessions[session.id]?.effortLevel;
                const resolvedEffortLevel = existingEffortLevel ?? savedEffortLevels[session.id] ?? session.effortLevel ?? null;

                const previousSession = state.sessions[session.id];
                const previousRowState = previousSession
                    ? buildSessionRowData(previousSession, {
                        lastViewedAt: state.sessionLastViewedAt[session.id],
                        unviewedCompletionAt: state.sessionUnviewedCompletionAt[session.id],
                    }).state
                    : null;

                const nextSession = {
                    ...preserveNewerLocalArchiveProjection(previousSession, session),
                    presence,
                    draft: existingDraft || savedDraft || session.draft || null,
                    permissionMode: resolvedPermissionMode,
                    modelMode: resolvedModelMode,
                    effortLevel: resolvedEffortLevel,
                };
                mergedSessions[session.id] = nextSession;

                const nextRowState = buildSessionRowData(nextSession).state;
                const wasBusyWhenLastViewed = busySessionStates.has(state.sessionLastViewedState[session.id] as SessionState);
                const justCompleted = nextSession.active
                    && nextRowState === 'waiting'
                    && (
                        previousRowState === 'thinking'
                        || previousRowState === 'permission_required'
                        || wasBusyWhenLastViewed
                    );
                if (justCompleted) {
                    nextSessionUnviewedCompletionAt[session.id] = Math.max(nextSession.updatedAt ?? 0, Date.now());
                    didChangeUnviewedCompletionAt = true;
                }
            });

            // Build active set from all sessions (including existing ones)
            const activeSet = new Set<string>();
            Object.values(mergedSessions).forEach(session => {
                if (isSessionActive(session)) {
                    activeSet.add(session.id);
                }
            });

            // Separate active and inactive sessions
            const activeSessions: Session[] = [];
            const inactiveSessions: Session[] = [];

            // Process all sessions from merged set
            Object.values(mergedSessions).forEach(session => {
                if (!isTopLevelSession(session)) return;
                if (activeSet.has(session.id)) {
                    activeSessions.push(session);
                } else {
                    inactiveSessions.push(session);
                }
            });

            // Sort both arrays by creation date for stable ordering
            activeSessions.sort((a, b) => b.createdAt - a.createdAt);
            inactiveSessions.sort((a, b) => b.createdAt - a.createdAt);

            // Build flat list data for FlashList
            const listData: SessionListItem[] = [];

            if (activeSessions.length > 0) {
                listData.push('online');
                listData.push(...activeSessions);
            }

            // Legacy sessionsData - to be removed
            // Machines are now integrated into sessionListViewData

            if (inactiveSessions.length > 0) {
                listData.push('offline');
                listData.push(...inactiveSessions);
            }

            // console.log(`📊 Storage: applySessions called with ${sessions.length} sessions, active: ${activeSessions.length}, inactive: ${inactiveSessions.length}`);

            // Process AgentState updates for sessions that already have messages loaded
            const updatedSessionMessages = { ...state.sessionMessages };

            sessions.forEach(session => {
                const oldSession = state.sessions[session.id];
                const newSession = mergedSessions[session.id];

                // Check if sessionMessages exists AND agentStateVersion is newer
                const existingSessionMessages = updatedSessionMessages[session.id];
                if (existingSessionMessages && newSession.agentState &&
                    (!oldSession || newSession.agentStateVersion > (oldSession.agentStateVersion || 0))) {

                    // Process new AgentState through reducer
                    const reducerResult = reducer(existingSessionMessages.reducerState, [], newSession.agentState);
                    const processedMessages = reducerResult.messages;

                    // Always update the session messages, even if no new messages were created
                    // This ensures the reducer state is updated with the new AgentState
                    const merged = mergeMessagesNewestFirst(
                        existingSessionMessages.messages,
                        existingSessionMessages.messagesMap,
                        processedMessages,
                    );
                    const runningToolCount = updateRunningToolCount(
                        existingSessionMessages.runningToolCount,
                        existingSessionMessages.messagesMap,
                        processedMessages,
                    );

                    updatedSessionMessages[session.id] = {
                        messages: merged.messages,
                        messagesMap: merged.messagesMap,
                        runningToolCount,
                        reducerState: existingSessionMessages.reducerState, // The reducer modifies state in-place, so this has the updates
                        isLoaded: existingSessionMessages.isLoaded,
                        hasMoreBefore: existingSessionMessages.hasMoreBefore,
                        isLoadingBefore: existingSessionMessages.isLoadingBefore,
                        loadError: existingSessionMessages.loadError,
                    };

                    // IMPORTANT: Copy latestUsage from reducerState to Session for immediate availability
                    if (existingSessionMessages.reducerState.latestUsage) {
                        mergedSessions[session.id] = {
                            ...mergedSessions[session.id],
                            latestUsage: { ...existingSessionMessages.reducerState.latestUsage }
                        };
                    }
                }
            });

            // Build new unified list view data
            const sessionListViewData = buildSessionListViewData(
                mergedSessions,
                state.settings.hideInactiveSessions,
                buildViewStateMap(state.sessionLastViewedAt, nextSessionUnviewedCompletionAt),
            );

            // Update project manager with current sessions and machines
            syncProjectManagerSessions(mergedSessions, state.machines);

            // Build project-centric view data after project manager has the latest session mapping
            const projectListViewData = rebuildProjectListViewData(
                mergedSessions,
                state.machines,
                state.settings,
                state.officialCodexThreads,
                state.sessionLastViewedAt,
                nextSessionUnviewedCompletionAt,
            );

            if (didChangeUnviewedCompletionAt) {
                sessionUnviewedCompletionAt = nextSessionUnviewedCompletionAt;
                saveSessionUnviewedCompletionAt(nextSessionUnviewedCompletionAt);
            }

            const boundedSessionMessages = boundSessionMessages(mergedSessions, updatedSessionMessages);

            return {
                ...state,
                sessions: mergedSessions,
                sessionUnviewedCompletionAt: nextSessionUnviewedCompletionAt,
                sessionsData: listData,  // Legacy - to be removed
                sessionListViewData,
                projectListViewData,
                sessionMessages: boundedSessionMessages
            };
        }),
        applyLoaded: () => set((state) => {
            const result = {
                ...state,
                sessionsData: []
            };
            return result;
        }),
        applyReady: () => set((state) => ({
            ...state,
            isDataReady: true
        })),
        applyMessages: (sessionId: string, messages: NormalizedMessage[]) => {
            let changed = new Set<string>();
            let hasReadyEvent = false;

            // Track plan mode transitions through the batch in order.
            // Set true on EnterPlanMode, false on ExitPlanMode. The final value
            // tells us whether the batch ends with an unresolved plan entry.
            // This prevents history replays (which contain both Enter + Exit) from
            // re-triggering plan mode, while still catching real-time EnterPlanMode.
            let shouldEnterPlanMode = false;
            for (const msg of messages) {
                if (msg.role === 'agent') {
                    for (const c of msg.content) {
                        if (c.type === 'tool-call') {
                            if (c.name === 'EnterPlanMode' || c.name === 'enter_plan_mode') {
                                shouldEnterPlanMode = true;
                            } else if (c.name === 'ExitPlanMode' || c.name === 'exit_plan_mode') {
                                shouldEnterPlanMode = false;
                            }
                        }
                    }
                }
            }

            set((state) => {

                // Resolve session messages state
                const existingSession = state.sessionMessages[sessionId] || {
                    messages: [],
                    messagesMap: {},
                    runningToolCount: 0,
                    reducerState: createReducer(),
                    isLoaded: false,
                    hasMoreBefore: false,
                    isLoadingBefore: false,
                    loadError: null,
                };

                // Get the session's agentState if available
                const session = state.sessions[sessionId];
                const agentState = session?.agentState;

                // Messages are already normalized, no need to process them again
                const normalizedMessages = messages;

                // Run reducer with agentState
                const reducerResult = reducer(existingSession.reducerState, normalizedMessages, agentState);
                const processedMessages = reducerResult.messages;
                for (let message of processedMessages) {
                    changed.add(message.id);
                }
                if (reducerResult.hasReadyEvent) {
                    hasReadyEvent = true;
                }

                // Merge messages
                const merged = mergeMessagesNewestFirst(
                    existingSession.messages,
                    existingSession.messagesMap,
                    processedMessages,
                );
                const messagesArray = merged.messages;
                const runningToolCount = updateRunningToolCount(
                    existingSession.runningToolCount,
                    existingSession.messagesMap,
                    processedMessages,
                );

                // Update session with todos, latestUsage and activity inferred from message state.
                // IMPORTANT: We extract latestUsage from the mutable reducerState and copy it to the Session object
                // This ensures latestUsage is available immediately on load, even before messages are fully loaded
                let updatedSessions = state.sessions;
                const inferredThinking = runningToolCount > 0;
                const shouldSetThinking = !!session && inferredThinking && !session.thinking;
                const shouldClearThinking = !!session && reducerResult.hasReadyEvent && session.thinking;
                const needsUpdate = (reducerResult.todos !== undefined || existingSession.reducerState.latestUsage || shouldEnterPlanMode || shouldSetThinking || shouldClearThinking) && session;

                if (needsUpdate) {
                    const nextThinking = shouldSetThinking ? true : shouldClearThinking ? false : session.thinking;
                    updatedSessions = {
                        ...state.sessions,
                        [sessionId]: {
                            ...session,
                            ...(reducerResult.todos !== undefined && { todos: reducerResult.todos }),
                            // Copy latestUsage from reducerState to make it immediately available
                            latestUsage: existingSession.reducerState.latestUsage ? {
                                ...existingSession.reducerState.latestUsage
                            } : session.latestUsage,
                            // Auto-switch to plan mode when EnterPlanMode tool call is detected
                            ...(shouldEnterPlanMode && { permissionMode: 'plan' }),
                            ...(shouldSetThinking || shouldClearThinking ? {
                                thinking: nextThinking,
                                thinkingAt: Date.now(),
                            } : {}),
                        }
                    };
                }
                const nextSessionUnviewedCompletionAt = { ...state.sessionUnviewedCompletionAt };
                let didChangeUnviewedCompletionAt = false;
                if (session && updatedSessions !== state.sessions) {
                    const previousRowState = buildSessionRowData(session, {
                        lastViewedAt: state.sessionLastViewedAt[sessionId],
                        unviewedCompletionAt: state.sessionUnviewedCompletionAt[sessionId],
                    }).state;
                    const nextSession = updatedSessions[sessionId];
                    const nextRowState = nextSession ? buildSessionRowData(nextSession).state : null;
                    const wasBusyWhenLastViewed = busySessionStates.has(state.sessionLastViewedState[sessionId] as SessionState);
                    const justCompleted = !!nextSession
                        && nextSession.active
                        && nextRowState === 'waiting'
                        && (
                            previousRowState === 'thinking'
                            || previousRowState === 'permission_required'
                            || wasBusyWhenLastViewed
                        );
                    if (justCompleted) {
                        nextSessionUnviewedCompletionAt[sessionId] = Math.max(nextSession.updatedAt ?? 0, Date.now());
                        didChangeUnviewedCompletionAt = true;
                    }
                }
                const sessionListViewData = updatedSessions !== state.sessions
                    ? buildSessionListViewData(
                        updatedSessions,
                        state.settings.hideInactiveSessions,
                        buildViewStateMap(state.sessionLastViewedAt, nextSessionUnviewedCompletionAt),
                    )
                    : state.sessionListViewData;
                const projectListViewData = updatedSessions !== state.sessions
                    ? buildProjectListViewData(
                        updatedSessions,
                        state.machines,
                        state.settings.projectCustomizations,
                        (sid) => projectManager.getSessionProjectGitStatus(sid),
                        state.settings.hideInactiveSessions,
                        Object.values(state.officialCodexThreads).flat(),
                        buildViewStateMap(state.sessionLastViewedAt, nextSessionUnviewedCompletionAt),
                    )
                    : state.projectListViewData;

                if (didChangeUnviewedCompletionAt) {
                    sessionUnviewedCompletionAt = nextSessionUnviewedCompletionAt;
                    saveSessionUnviewedCompletionAt(nextSessionUnviewedCompletionAt);
                }

                return {
                    ...state,
                    sessions: updatedSessions,
                    sessionUnviewedCompletionAt: nextSessionUnviewedCompletionAt,
                    sessionListViewData,
                    projectListViewData,
                    sessionMessages: applyBoundedSessionMessageUpdate(
                        updatedSessions,
                        state.sessionMessages,
                        sessionId,
                        {
                            ...existingSession,
                            messages: messagesArray,
                            messagesMap: merged.messagesMap,
                            runningToolCount,
                            reducerState: existingSession.reducerState, // Explicitly include the mutated reducer state
                            isLoaded: true,
                            hasMoreBefore: existingSession.hasMoreBefore,
                            isLoadingBefore: existingSession.isLoadingBefore,
                            loadError: null,
                        },
                    )
                };
            });

            // Persist plan mode change
            if (shouldEnterPlanMode) {
                const allModes: Record<string, string> = {};
                const currentState = get();
                Object.entries(currentState.sessions).forEach(([id, sess]) => {
                    if (sess.permissionMode && sess.permissionMode !== 'default') {
                        allModes[id] = sess.permissionMode;
                    }
                });
                saveSessionPermissionModes(allModes);
            }

            return { changed: Array.from(changed), hasReadyEvent };
        },
        applyMessagesLoaded: (sessionId: string) => set((state) => {
            const existingSession = state.sessionMessages[sessionId];
            let result: StorageState;

            if (!existingSession) {
                // First time loading - check for AgentState
                const session = state.sessions[sessionId];
                const agentState = session?.agentState;

                // Create new reducer state
                const reducerState = createReducer();

                // Process AgentState if it exists
                let messages: Message[] = [];
                let messagesMap: Record<string, Message> = {};
                let runningToolCount = 0;

                if (agentState) {
                    // Process AgentState through reducer to get initial permission messages
                    const reducerResult = reducer(reducerState, [], agentState);
                    const processedMessages = reducerResult.messages;

                    processedMessages.forEach(message => {
                        messagesMap[message.id] = message;
                    });

                    messages = Object.values(messagesMap)
                        .sort((a, b) => b.createdAt - a.createdAt);
                    runningToolCount = countRunningToolsInMessages(messages);
                }

                // Extract latestUsage from reducerState if available and update session
                let updatedSessions = state.sessions;
                if (session && reducerState.latestUsage) {
                    updatedSessions = {
                        ...state.sessions,
                        [sessionId]: {
                            ...session,
                            latestUsage: { ...reducerState.latestUsage }
                        }
                    };
                }

                result = {
                    ...state,
                    sessions: updatedSessions,
                    sessionMessages: applyBoundedSessionMessageUpdate(
                        updatedSessions,
                        state.sessionMessages,
                        sessionId,
                        {
                            reducerState,
                            messages,
                            messagesMap,
                            runningToolCount,
                            isLoaded: true,
                            hasMoreBefore: false,
                            isLoadingBefore: false,
                            loadError: null,
                        } satisfies SessionMessages,
                    )
                };
            } else {
                result = {
                    ...state,
                    sessionMessages: applyBoundedSessionMessageUpdate(
                        state.sessions,
                        state.sessionMessages,
                        sessionId,
                        {
                            ...existingSession,
                            isLoaded: true,
                            loadError: null,
                        } satisfies SessionMessages,
                    )
                };
            }

            return result;
        }),
        applyMessagesLoadError: (sessionId, loadError) => set((state) => {
            const existingSession = state.sessionMessages[sessionId] || {
                messages: [],
                messagesMap: {},
                runningToolCount: 0,
                reducerState: createReducer(),
                isLoaded: false,
                hasMoreBefore: false,
                isLoadingBefore: false,
                loadError: null,
            };

            return {
                ...state,
                sessionMessages: applyBoundedSessionMessageUpdate(
                    state.sessions,
                    state.sessionMessages,
                    sessionId,
                    {
                        ...existingSession,
                        loadError,
                    } satisfies SessionMessages,
                ),
            };
        }),
        applyMessageHistoryState: (sessionId, historyState) => set((state) => {
            const existingSession = state.sessionMessages[sessionId] || {
                messages: [],
                messagesMap: {},
                runningToolCount: 0,
                reducerState: createReducer(),
                isLoaded: false,
                hasMoreBefore: false,
                isLoadingBefore: false,
                loadError: null,
            };

            return {
                ...state,
                sessionMessages: applyBoundedSessionMessageUpdate(
                    state.sessions,
                    state.sessionMessages,
                    sessionId,
                    {
                        ...existingSession,
                        ...historyState,
                    } satisfies SessionMessages,
                ),
            };
        }),
        applySettingsLocal: (settings: Partial<Settings>) => set((state) => {
            const updatedSettings = applySettings(state.settings, settings);
            saveSettings(updatedSettings, state.settingsVersion ?? 0);
            // Rebuild project list if customizations changed
                const projectListViewData = buildProjectListViewData(
                    state.sessions,
                    state.machines,
                    updatedSettings.projectCustomizations,
                    (sid) => projectManager.getSessionProjectGitStatus(sid),
                    updatedSettings.hideInactiveSessions,
                    Object.values(state.officialCodexThreads).flat(),
                    buildCurrentViewStateMap(state),
                );
            return {
                ...state,
                settings: updatedSettings,
                projectListViewData,
            };
        }),
        applySettings: (settings: Settings, version: number) => set((state) => {
            if (state.settingsVersion === null || state.settingsVersion < version) {
                saveSettings(settings, version);
                // Rebuild project list if customizations changed
                const projectListViewData = buildProjectListViewData(
                    state.sessions,
                    state.machines,
                    settings.projectCustomizations,
                    (sid) => projectManager.getSessionProjectGitStatus(sid),
                    settings.hideInactiveSessions,
                    Object.values(state.officialCodexThreads).flat(),
                    buildCurrentViewStateMap(state),
                );
                return {
                    ...state,
                    settings,
                    settingsVersion: version,
                    projectListViewData,
                };
            } else {
                return state;
            }
        }),
        applyLocalSettings: (delta: Partial<LocalSettings>) => set((state) => {
            const updatedLocalSettings = applyLocalSettings(state.localSettings, delta);
            saveLocalSettings(updatedLocalSettings);
            return {
                ...state,
                localSettings: updatedLocalSettings
            };
        }),
        applyProfile: (profile: Profile) => set((state) => {
            // Always save and update profile
            saveProfile(profile);
            return {
                ...state,
                profile
            };
        }),
        applySessionUsage: (sessionId: string, usage: LatestSessionUsage) => set((state) => {
            const session = state.sessions[sessionId];
            const sessionMessages = state.sessionMessages[sessionId];
            const currentUsage = sessionMessages?.reducerState.latestUsage ?? session?.latestUsage ?? null;

            if (!session && !sessionMessages) {
                return state;
            }
            if (currentUsage && usage.timestamp <= currentUsage.timestamp) {
                return state;
            }

            const sessions = session ? {
                ...state.sessions,
                [sessionId]: {
                    ...session,
                    latestUsage: { ...usage },
                },
            } : state.sessions;

            const sessionMessagesById = sessionMessages ? {
                ...state.sessionMessages,
                [sessionId]: {
                    ...sessionMessages,
                    reducerState: {
                        ...sessionMessages.reducerState,
                        latestUsage: { ...usage },
                    },
                },
            } : state.sessionMessages;

            return {
                ...state,
                sessions,
                sessionMessages: sessionMessagesById,
            };
        }),
        applyGitStatus: (sessionId: string, status: GitStatus | null) => set((state) => {
            syncProjectManagerSessions(state.sessions, state.machines);
            // Update project git status as well
            projectManager.updateSessionProjectGitStatus(sessionId, status);
            const projectListViewData = rebuildProjectListViewData(
                state.sessions,
                state.machines,
                state.settings,
                state.officialCodexThreads,
                state.sessionLastViewedAt,
                state.sessionUnviewedCompletionAt,
            );

            return {
                ...state,
                projectListViewData,
                sessionGitStatus: {
                    ...state.sessionGitStatus,
                    [sessionId]: status
                }
            };
        }),
        applyGitStatusFiles: (sessionId: string, files: GitStatusFiles | null) => set((state) => ({
            ...state,
            sessionGitStatusFiles: {
                ...state.sessionGitStatusFiles,
                [sessionId]: files
            }
        })),
        applyFileCache: (sessionId: string, filePath: string, content: string | null, diff: string | null, isBinary: boolean, totalSize?: number, truncated?: boolean, version?: string) => set((state) => ({
            ...state,
            sessionFileCache: applyBoundedFilePreviewCache(
                state.sessionFileCache,
                sessionId,
                filePath,
                { content, diff, isBinary, totalSize, truncated, cachedAt: Date.now(), version },
            ),
        })),
        touchFileCache: (sessionId: string, filePath: string) => set((state) => ({
            ...state,
            sessionFileCache: touchFilePreviewCache(state.sessionFileCache, sessionId, filePath, Date.now()),
        })),
        applyNativeUpdateStatus: (status: { available: boolean; updateUrl?: string } | null) => set((state) => ({
            ...state,
            nativeUpdateStatus: status
        })),
        setSocketStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => set((state) => {
            const now = Date.now();
            const updates: Partial<StorageState> = {
                socketStatus: status
            };

            // Update timestamp based on status
            if (status === 'connected') {
                updates.socketLastConnectedAt = now;
            } else if (status === 'disconnected' || status === 'error') {
                updates.socketLastDisconnectedAt = now;
            }

            return {
                ...state,
                ...updates
            };
        }),
        updateSessionDraft: (sessionId: string, draft: string | null) => set((state) => {
            const session = state.sessions[sessionId];
            if (!session) return state;

            // Don't store empty strings, convert to null
            const normalizedDraft = draft?.trim() ? draft : null;

            // Collect all drafts for persistence
            const allDrafts: Record<string, string> = {};
            Object.entries(state.sessions).forEach(([id, sess]) => {
                if (id === sessionId) {
                    if (normalizedDraft) {
                        allDrafts[id] = normalizedDraft;
                    }
                } else if (sess.draft) {
                    allDrafts[id] = sess.draft;
                }
            });

            // Persist drafts
            saveSessionDrafts(allDrafts);

            const updatedSessions = {
                ...state.sessions,
                [sessionId]: {
                    ...session,
                    draft: normalizedDraft
                }
            };

            return {
                ...state,
                sessions: updatedSessions,
                sessionListViewData: buildSessionListViewData(
                    updatedSessions,
                    state.settings.hideInactiveSessions,
                    buildCurrentViewStateMap(state),
                )
            };
        }),
        updateSessionPermissionMode: (sessionId: string, mode: string) => set((state) => {
            const session = state.sessions[sessionId];
            if (!session) return state;

            // Update the session with the new permission mode
            const updatedSessions = {
                ...state.sessions,
                [sessionId]: {
                    ...session,
                    permissionMode: mode
                }
            };

            // Collect all permission modes for persistence
            const allModes: Record<string, string> = {};
            Object.entries(updatedSessions).forEach(([id, sess]) => {
                if (sess.permissionMode && sess.permissionMode !== 'default') {
                    allModes[id] = sess.permissionMode;
                }
            });

            // Persist permission modes (only non-default values to save space)
            saveSessionPermissionModes(allModes);

            // No need to rebuild sessionListViewData since permission mode doesn't affect the list display
            return {
                ...state,
                sessions: updatedSessions
            };
        }),
        updateSessionModelMode: (sessionId: string, mode: string) => set((state) => {
            const session = state.sessions[sessionId];
            if (!session) return state;

            // Update the session with the new model mode
            const updatedSessions = {
                ...state.sessions,
                [sessionId]: {
                    ...session,
                    modelMode: mode
                }
            };

            // Persist model modes so the selection survives app restart (#1028).
            // Only non-default values are kept — matches the permissionMode pattern above.
            const allModes: Record<string, string> = {};
            Object.entries(updatedSessions).forEach(([id, sess]) => {
                if (sess.modelMode && sess.modelMode !== 'default') {
                    allModes[id] = sess.modelMode;
                }
            });
            saveSessionModelModes(allModes);

            // No need to rebuild sessionListViewData since model mode doesn't affect the list display
            return {
                ...state,
                sessions: updatedSessions
            };
        }),
        updateSessionEffortLevel: (sessionId: string, level: string) => set((state) => {
            const session = state.sessions[sessionId];
            if (!session) return state;

            const updatedSessions = {
                ...state.sessions,
                [sessionId]: {
                    ...session,
                    effortLevel: level
                }
            };

            // Persist effort levels so the selection survives app restart (#1028).
            const allLevels: Record<string, string> = {};
            Object.entries(updatedSessions).forEach(([id, sess]) => {
                if (sess.effortLevel) {
                    allLevels[id] = sess.effortLevel;
                }
            });
            saveSessionEffortLevels(allLevels);

            return {
                ...state,
                sessions: updatedSessions
            };
        }),
        markSessionViewed: (sessionId: string) => set((state) => {
            const session = state.sessions[sessionId];
            if (!session) return state;

            const viewedAt = Math.max(Date.now(), session.updatedAt ?? 0, state.sessionUnviewedCompletionAt[sessionId] ?? 0);
            const viewedState = buildSessionRowData(session).state;
            const nextSessionLastViewedAt = {
                ...state.sessionLastViewedAt,
                [sessionId]: viewedAt,
            };
            sessionLastViewedAt = nextSessionLastViewedAt;
            saveSessionLastViewedAt(nextSessionLastViewedAt);

            const nextSessionLastViewedState = {
                ...state.sessionLastViewedState,
                [sessionId]: viewedState,
            };
            sessionLastViewedState = nextSessionLastViewedState;
            saveSessionLastViewedState(nextSessionLastViewedState);

            const nextSessionUnviewedCompletionAt = { ...state.sessionUnviewedCompletionAt };
            if (!busySessionStates.has(viewedState)) {
                delete nextSessionUnviewedCompletionAt[sessionId];
                sessionUnviewedCompletionAt = nextSessionUnviewedCompletionAt;
                saveSessionUnviewedCompletionAt(nextSessionUnviewedCompletionAt);
            }

            const viewStateMap = buildViewStateMap(nextSessionLastViewedAt, nextSessionUnviewedCompletionAt);
            const sessionListViewData = buildSessionListViewData(
                state.sessions,
                state.settings.hideInactiveSessions,
                viewStateMap,
            );
            const projectListViewData = buildProjectListViewData(
                state.sessions,
                state.machines,
                state.settings.projectCustomizations,
                (sid) => projectManager.getSessionProjectGitStatus(sid),
                state.settings.hideInactiveSessions,
                Object.values(state.officialCodexThreads).flat(),
                viewStateMap,
            );

            return {
                ...state,
                sessionLastViewedAt: nextSessionLastViewedAt,
                sessionLastViewedState: nextSessionLastViewedState,
                sessionUnviewedCompletionAt: nextSessionUnviewedCompletionAt,
                sessionListViewData,
                projectListViewData,
            };
        }),
        // Project management methods
        getProjects: () => projectManager.getProjects(),
        getProject: (projectId: string) => projectManager.getProject(projectId),
        getProjectForSession: (sessionId: string) => projectManager.getProjectForSession(sessionId),
        getProjectSessions: (projectId: string) => projectManager.getProjectSessions(projectId),
        // Project git status methods
        getProjectGitStatus: (projectId: string) => projectManager.getProjectGitStatus(projectId),
        getSessionProjectGitStatus: (sessionId: string) => projectManager.getSessionProjectGitStatus(sessionId),
        updateSessionProjectGitStatus: (sessionId: string, status: GitStatus | null) => {
            const currentState = get();
            syncProjectManagerSessions(currentState.sessions, currentState.machines);
            projectManager.updateSessionProjectGitStatus(sessionId, status);
            // Trigger a state update to notify hooks
            set((state) => ({
                ...state,
                projectListViewData: rebuildProjectListViewData(
                    state.sessions,
                    state.machines,
                    state.settings,
                    state.officialCodexThreads,
                    state.sessionLastViewedAt,
                    state.sessionUnviewedCompletionAt,
                ),
            }));
        },
        applyMachines: (machines: Machine[], replace: boolean = false) => set((state) => {
            // Either replace all machines or merge updates
            let mergedMachines: Record<string, Machine>;

            if (replace) {
                // Replace entire machine state (used by fetchMachines)
                mergedMachines = {};
                machines.forEach(machine => {
                    mergedMachines[machine.id] = machine;
                });
            } else {
                // Merge individual updates (used by update-machine)
                mergedMachines = { ...state.machines };
                machines.forEach(machine => {
                    mergedMachines[machine.id] = machine;
                });
            }

            // Rebuild sessionListViewData to reflect machine changes
            const sessionListViewData = buildSessionListViewData(
                state.sessions,
                state.settings.hideInactiveSessions,
                buildCurrentViewStateMap(state),
            );
            const projectListViewData = buildProjectListViewData(
                state.sessions,
                mergedMachines,
                state.settings.projectCustomizations,
                (sid) => projectManager.getSessionProjectGitStatus(sid),
                state.settings.hideInactiveSessions,
                Object.values(state.officialCodexThreads).flat(),
                buildCurrentViewStateMap(state),
            );

            return {
                ...state,
                machines: mergedMachines,
                sessionListViewData,
                projectListViewData,
            };
        }),
        deleteMachine: (machineId: string) => set((state) => {
            if (!state.machines[machineId]) {
                return state;
            }
            const { [machineId]: _removed, ...remaining } = state.machines;
            const sessionListViewData = buildSessionListViewData(
                state.sessions,
                state.settings.hideInactiveSessions,
                buildCurrentViewStateMap(state),
            );
            const projectListViewData = buildProjectListViewData(
                state.sessions,
                remaining,
                state.settings.projectCustomizations,
                (sid) => projectManager.getSessionProjectGitStatus(sid),
                state.settings.hideInactiveSessions,
                Object.values(state.officialCodexThreads).flat(),
                buildCurrentViewStateMap(state),
            );
            return {
                ...state,
                machines: remaining,
                sessionListViewData,
                projectListViewData,
            };
        }),
        // Artifact methods
        applyArtifacts: (artifacts: DecryptedArtifact[]) => set((state) => {
            const mergedArtifacts = { ...state.artifacts };
            artifacts.forEach(artifact => {
                mergedArtifacts[artifact.id] = artifact;
            });

            return {
                ...state,
                artifacts: mergedArtifacts
            };
        }),
        addArtifact: (artifact: DecryptedArtifact) => set((state) => {
            const updatedArtifacts = {
                ...state.artifacts,
                [artifact.id]: artifact
            };
            
            return {
                ...state,
                artifacts: updatedArtifacts
            };
        }),
        updateArtifact: (artifact: DecryptedArtifact) => set((state) => {
            const updatedArtifacts = {
                ...state.artifacts,
                [artifact.id]: artifact
            };
            
            return {
                ...state,
                artifacts: updatedArtifacts
            };
        }),
        deleteArtifact: (artifactId: string) => set((state) => {
            const { [artifactId]: _, ...remainingArtifacts } = state.artifacts;
            
            return {
                ...state,
                artifacts: remainingArtifacts
            };
        }),
        deleteSession: (sessionId: string) => set((state) => {
            // Remove session from sessions
            const { [sessionId]: deletedSession, ...remainingSessions } = state.sessions;
            
            // Remove session messages if they exist
            const { [sessionId]: deletedMessages, ...remainingSessionMessages } = state.sessionMessages;
            
            // Remove session git status if it exists
            const { [sessionId]: deletedGitStatus, ...remainingGitStatus } = state.sessionGitStatus;
            const { [sessionId]: _gitStatusFiles, ...remainingGitStatusFiles } = state.sessionGitStatusFiles;
            const { [sessionId]: _fileCache, ...remainingFileCache } = state.sessionFileCache;

            // Clear drafts, permission modes, model modes, effort levels from persistent storage
            const drafts = loadSessionDrafts();
            delete drafts[sessionId];
            saveSessionDrafts(drafts);

            const modes = loadSessionPermissionModes();
            delete modes[sessionId];
            saveSessionPermissionModes(modes);

            const modelModes = loadSessionModelModes();
            delete modelModes[sessionId];
            saveSessionModelModes(modelModes);

            const effortLevels = loadSessionEffortLevels();
            delete effortLevels[sessionId];
            saveSessionEffortLevels(effortLevels);

            const nextSessionLastViewedAt = { ...state.sessionLastViewedAt };
            delete nextSessionLastViewedAt[sessionId];
            sessionLastViewedAt = nextSessionLastViewedAt;
            saveSessionLastViewedAt(nextSessionLastViewedAt);

            const nextSessionLastViewedState = { ...state.sessionLastViewedState };
            delete nextSessionLastViewedState[sessionId];
            sessionLastViewedState = nextSessionLastViewedState;
            saveSessionLastViewedState(nextSessionLastViewedState);

            const nextSessionUnviewedCompletionAt = { ...state.sessionUnviewedCompletionAt };
            delete nextSessionUnviewedCompletionAt[sessionId];
            sessionUnviewedCompletionAt = nextSessionUnviewedCompletionAt;
            saveSessionUnviewedCompletionAt(nextSessionUnviewedCompletionAt);
            
            // Rebuild sessionListViewData without the deleted session
            const viewStateMap = buildViewStateMap(nextSessionLastViewedAt, nextSessionUnviewedCompletionAt);
            const sessionListViewData = buildSessionListViewData(
                remainingSessions,
                state.settings.hideInactiveSessions,
                viewStateMap,
            );
            const projectListViewData = buildProjectListViewData(
                remainingSessions,
                state.machines,
                state.settings.projectCustomizations,
                (sid) => projectManager.getSessionProjectGitStatus(sid),
                state.settings.hideInactiveSessions,
                Object.values(state.officialCodexThreads).flat(),
                viewStateMap,
            );

            return {
                ...state,
                sessions: remainingSessions,
                sessionMessages: remainingSessionMessages,
                sessionGitStatus: remainingGitStatus,
                sessionGitStatusFiles: remainingGitStatusFiles,
                sessionFileCache: remainingFileCache,
                sessionLastViewedAt: nextSessionLastViewedAt,
                sessionLastViewedState: nextSessionLastViewedState,
                sessionUnviewedCompletionAt: nextSessionUnviewedCompletionAt,
                sessionListViewData,
                projectListViewData,
            };
        }),
        applyOfficialCodexThreads: (machineId: string, threads: OfficialCodexThread[]) => set((state) => {
            if (equal(state.officialCodexThreads[machineId] ?? [], threads)) {
                return state;
            }
            const officialCodexThreads = {
                ...state.officialCodexThreads,
                [machineId]: threads,
            };

            return {
                ...state,
                officialCodexThreads,
                projectListViewData: rebuildProjectListViewData(
                    state.sessions,
                    state.machines,
                    state.settings,
                    officialCodexThreads,
                    state.sessionLastViewedAt,
                    state.sessionUnviewedCompletionAt,
                ),
            };
        }),
        startOfficialResumeSession: (sessionId: string, threadId: string, title?: string | null) => set((state) => ({
            ...state,
            officialResumeSessions: {
                ...state.officialResumeSessions,
                [sessionId]: { threadId, title, startedAt: Date.now() },
            },
        })),
        clearOfficialResumeSession: (sessionId: string) => set((state) => {
            if (!state.officialResumeSessions[sessionId]) {
                return state;
            }
            const { [sessionId]: _removed, ...rest } = state.officialResumeSessions;
            return {
                ...state,
                officialResumeSessions: rest,
            };
        }),
    }
});

export function useSessions() {
    return storage(useShallow((state) => state.isDataReady ? state.sessionsData : null));
}

export function useSession(id: string): Session | null {
    return storage(useShallow((state) => state.sessions[id] ?? null));
}

export function useSideChatSessions(parentSessionId: string | null): Session[] {
    return storage(useShallow((state) => selectSideChatSessions(Object.values(state.sessions), parentSessionId)));
}

const emptyArray: unknown[] = [];

export function useSessionMessages(sessionId: string): {
    messages: Message[];
    isLoaded: boolean;
    hasMoreBefore: boolean;
    isLoadingBefore: boolean;
    loadError: SessionMessageLoadError | null;
} {
    return storage(useShallow((state) => {
        const session = state.sessionMessages[sessionId];
        return {
            messages: session?.messages ?? emptyArray,
            isLoaded: session?.isLoaded ?? false,
            hasMoreBefore: session?.hasMoreBefore ?? false,
            isLoadingBefore: session?.isLoadingBefore ?? false,
            loadError: session?.loadError ?? null,
        };
    }));
}

export function useMessage(sessionId: string, messageId: string): Message | null {
    return storage(useShallow((state) => {
        const session = state.sessionMessages[sessionId];
        return session?.messagesMap[messageId] ?? null;
    }));
}

export function useSessionUsage(sessionId: string) {
    return storage(useShallow((state) => {
        const session = state.sessionMessages[sessionId];
        return session?.reducerState?.latestUsage ?? null;
    }));
}

export function useSettings(): Settings {
    return storage(useShallow((state) => state.settings));
}

export function useSettingMutable<K extends keyof Settings>(name: K): [Settings[K], (value: Settings[K]) => void] {
    const setValue = React.useCallback((value: Settings[K]) => {
        sync.applySettings({ [name]: value });
    }, [name]);
    const value = useSetting(name);
    return [value, setValue];
}

export function useSetting<K extends keyof Settings>(name: K): Settings[K] {
    return storage(useShallow((state) => state.settings[name]));
}

export function useLocalSettings(): LocalSettings {
    return storage(useShallow((state) => state.localSettings));
}

export function useOfficialResumeSession(sessionId: string) {
    return storage(useShallow((state) => state.officialResumeSessions[sessionId] ?? null));
}

export function useAllMachines(options?: { includeOffline?: boolean }): Machine[] {
    const includeOffline = options?.includeOffline ?? false;
    return storage(useShallow((state) => {
        if (!state.isDataReady) return [];
        const machines = Object.values(state.machines).sort((a, b) => b.createdAt - a.createdAt);
        return includeOffline ? machines : machines.filter((v) => v.active);
    }));
}

export function useMachine(machineId: string): Machine | null {
    return storage(useShallow((state) => state.machines[machineId] ?? null));
}

export function useSessionListViewData(): SessionListViewItem[] | null {
    return storage(useDeepEqual((state) => state.isDataReady ? state.sessionListViewData : null));
}

export function useProjectListViewData(): ProjectListViewItem[] | null {
    return storage(useDeepEqual((state) => state.isDataReady ? state.projectListViewData : null));
}

export function useAllSessions(): Session[] {
    return storage(useShallow((state) => {
        if (!state.isDataReady) return [];
        return Object.values(state.sessions).filter(isTopLevelSession).sort((a, b) => b.updatedAt - a.updatedAt);
    }));
}

export function useLocalSettingMutable<K extends keyof LocalSettings>(name: K): [LocalSettings[K], (value: LocalSettings[K]) => void] {
    const setValue = React.useCallback((value: LocalSettings[K]) => {
        storage.getState().applyLocalSettings({ [name]: value });
    }, [name]);
    const value = useLocalSetting(name);
    return [value, setValue];
}

// Project management hooks
export function useProjects() {
    return storage(useShallow((state) => state.getProjects()));
}

export function useProject(projectId: string | null) {
    return storage(useShallow((state) => projectId ? state.getProject(projectId) : null));
}

export function useProjectForSession(sessionId: string | null) {
    return storage(useShallow((state) => sessionId ? state.getProjectForSession(sessionId) : null));
}

export function useProjectSessions(projectId: string | null) {
    return storage(useShallow((state) => projectId ? state.getProjectSessions(projectId) : []));
}

export function useProjectGitStatus(projectId: string | null) {
    return storage(useShallow((state) => projectId ? state.getProjectGitStatus(projectId) : null));
}

export function useSessionProjectGitStatus(sessionId: string | null) {
    return storage(useShallow((state) => sessionId ? state.getSessionProjectGitStatus(sessionId) : null));
}

export function useLocalSetting<K extends keyof LocalSettings>(name: K): LocalSettings[K] {
    return storage(useShallow((state) => state.localSettings[name]));
}

// Artifact hooks
export function useArtifacts(): DecryptedArtifact[] {
    return storage(useShallow((state) => {
        if (!state.isDataReady) return [];
        // Filter out draft artifacts from the main list
        return Object.values(state.artifacts)
            .filter(artifact => !artifact.draft)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }));
}

export function useAllArtifacts(): DecryptedArtifact[] {
    return storage(useShallow((state) => {
        if (!state.isDataReady) return [];
        // Return all artifacts including drafts
        return Object.values(state.artifacts).sort((a, b) => b.updatedAt - a.updatedAt);
    }));
}

export function useDraftArtifacts(): DecryptedArtifact[] {
    return storage(useShallow((state) => {
        if (!state.isDataReady) return [];
        // Return only draft artifacts
        return Object.values(state.artifacts)
            .filter(artifact => artifact.draft === true)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }));
}

export function useArtifact(artifactId: string): DecryptedArtifact | null {
    return storage(useShallow((state) => state.artifacts[artifactId] ?? null));
}

export function useArtifactsCount(): number {
    return storage(useShallow((state) => {
        // Count only non-draft artifacts
        return Object.values(state.artifacts).filter(a => !a.draft).length;
    }));
}

export function useSocketStatus() {
    return storage(useShallow((state) => ({
        status: state.socketStatus,
        lastConnectedAt: state.socketLastConnectedAt,
        lastDisconnectedAt: state.socketLastDisconnectedAt
    })));
}

export function useSessionGitStatus(sessionId: string): GitStatus | null {
    return storage(useShallow((state) => state.sessionGitStatus[sessionId] ?? null));
}

export function useSessionGitStatusFiles(sessionId: string): GitStatusFiles | null {
    return storage(useShallow((state) => state.sessionGitStatusFiles[sessionId] ?? null));
}

export function useSessionFileCache(sessionId: string, filePath: string, version?: string) {
    return storage(useShallow((state) => {
        const entry = state.sessionFileCache[sessionId]?.[filePath];
        return isFilePreviewCacheEntryFresh(entry, Date.now(), { version }) ? entry : null;
    }));
}

export function useIsDataReady(): boolean {
    return storage(useShallow((state) => state.isDataReady));
}

export function useProfile() {
    return storage(useShallow((state) => state.profile));
}
