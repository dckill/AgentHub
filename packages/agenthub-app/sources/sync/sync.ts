import Constants from 'expo-constants';
import { apiSocket, getAgentHubClientId } from '@/sync/apiSocket';
import { AuthCredentials } from '@/auth/tokenStorage';
import { Encryption } from '@/sync/encryption/encryption';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { storage } from './storage';
import { ApiEphemeralUpdateSchema, ApiMessage, ApiUpdateContainerSchema } from './apiTypes';
import type { ApiEphemeralActivityUpdate } from './apiTypes';
import { Session, Machine } from './storageTypes';
import { InvalidateSync } from '@/utils/sync';
import { ActivityUpdateAccumulator } from './reducer/activityUpdateAccumulator';
import { randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { syncCurrentPushToken } from './pushRegistration';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { isRunningOnMac } from '@/utils/platform';
import { NormalizedMessage, normalizeRawMessage, RawRecord } from './typesRaw';
import { applySettings, Settings, settingsDefaults, settingsParse, SUPPORTED_SCHEMA_VERSION } from './settings';
import { Profile, profileParse } from './profile';
import { loadPendingSettings, savePendingSettings } from './persistence';
import {
    initializeTracking,
    trackMessageSent,
} from '@/track';
import type { MessageSentSource } from '@/track';
import { parseToken } from '@/utils/parseToken';
import { getServerUrl } from './serverConfig';
import { log } from '@/log';
import { gitStatusSync } from './gitStatusSync';
import { projectManager } from './projectManager';
import { Message } from './typesMessage';
import { EncryptionCache } from './encryption/encryptionCache';
import { systemPrompt } from './prompt/systemPrompt';
import { fetchArtifact, fetchArtifacts, createArtifact, updateArtifact } from './apiArtifacts';
import { DecryptedArtifact, Artifact, ArtifactCreateRequest, ArtifactUpdateRequest } from './artifactTypes';
import { ArtifactEncryption } from './encryption/artifactEncryption';
import { resolveMessageModeMeta } from './messageMeta';
import { MessageIngestService } from './messageIngestService';
import { MessageCatchupBuffer } from './messageCatchupBuffer';
import { OutboxService } from './outboxService';
import { getLifecycleThinkingStateFromRawContent, resolveActivityThinkingState, resolveSessionThinkingState } from '@/utils/sessionActivity';
import { buildLatestUsageFromEphemeral } from './sessionUsage';
import { handleMissingSessionForUpdate, shouldRefreshMessagesForControlHandoff } from './sessionUpdateGuards';
import { runStartupSyncs, type StartupSyncTask } from './startupSyncScheduler';
import { AccountLifecycle, type AccountRequest } from './accountLifecycle';
import { RecoverableInitializationGate } from './initializationGate';
import { fileSearchCache } from './suggestionFile';
import { useFileTransferStore } from './fileTransferStore';
import { httpClient } from './authenticatedHttpClient';
import { createAbortScope } from './httpClient';
import { PaginationRetryGuard } from './paginationRetryGuard';
import { classifySessionMessageLoadError } from './sessionMessageLoadState';
import { reconcileSessionSnapshot } from './sessionSnapshot';
import { reconcileMachineSnapshot } from './machineSnapshot';
import { fetchCompleteCursorSnapshot } from './cursorSnapshot';
import { shouldReportSyncError } from './syncErrorReporting';

type V3GetSessionMessagesResponse = {
    messages: ApiMessage[];
    hasMore: boolean;
};

type V3PostSessionMessagesResponse = {
    messages: Array<{
        id: string;
        seq: number;
        localId: string | null;
        createdAt: number;
        updatedAt: number;
    }>;
};

type SendMessageOptions = {
    displayText?: string;
    fileReferences?: string[];
    images?: Array<{
        data: string;
        mimeType: string;
        name?: string;
        width?: number;
        height?: number;
    }>;
    source?: MessageSentSource;
};

type ApiSessionRecord = {
    id: string;
    tag?: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    agentState: string | null;
    agentStateVersion: number;
    dataEncryptionKey: string | null;
    active: boolean;
    activeAt: number;
    thinking?: boolean;
    thinkingAt?: number | null;
    createdAt: number;
    updatedAt: number;
    lastMessage?: ApiMessage | null;
};

type ApiSessionPage = {
    sessions: ApiSessionRecord[];
    nextCursor: string | null;
    hasNext: boolean;
};

type ProcessedMessagePage = {
    normalizedMessages: NormalizedMessage[];
    minSeq: number | null;
    maxSeq: number | null;
    lifecycleThinkingState: boolean | null;
};

const MESSAGE_CATCHUP_COMMIT_SIZE = 1_000;

class Sync {
    private static readonly BACKGROUND_SEND_TIMEOUT_MS = 30_000;
    private _encryption: Encryption | null = null;
    serverID = '';
    anonID = '';
    private credentials: AuthCredentials | null = null;
    public encryptionCache = new EncryptionCache();
    private sessionsSync!: InvalidateSync;
    private messagesSync = new Map<string, InvalidateSync>();
    private sendSync = new Map<string, InvalidateSync>();
    private sessionLastSeq = new Map<string, number>();
    private sessionFirstSeq = new Map<string, number>();
    private sessionHasMoreBefore = new Map<string, boolean>();
    private olderMessagesSync = new Map<string, InvalidateSync>();
    private olderMessagesRetryGuard = new PaginationRetryGuard();
    private outbox = new OutboxService();
    private messageIngest = new MessageIngestService((sessionId, messages) => this.applyMessages(sessionId, messages));
    private missingSessionRefreshes = new Set<string>();
    private sessionDataKeys = new Map<string, Uint8Array>(); // Store session data encryption keys internally
    private machineDataKeys = new Map<string, Uint8Array>(); // Store machine data encryption keys internally
    private artifactDataKeys = new Map<string, Uint8Array>(); // Store artifact data encryption keys internally
    private settingsSync!: InvalidateSync;
    private profileSync!: InvalidateSync;
    private machinesSync!: InvalidateSync;
    private pushTokenSync!: InvalidateSync;
    private nativeUpdateSync!: InvalidateSync;
    private artifactsSync!: InvalidateSync;
    private activityAccumulator: ActivityUpdateAccumulator;
    private pendingSettings: Partial<Settings> = loadPendingSettings();
    private appState: AppStateStatus = AppState.currentState;
    private backgroundSendTimeout: ReturnType<typeof setTimeout> | null = null;
    private backgroundSendNotificationId: string | null = null;
    private backgroundSendStartedAt: number | null = null;
    private cancelStartupSyncs: (() => void) | null = null;
    private readonly accountLifecycle = new AccountLifecycle();

    // Generic locking mechanism
    private recalculationLockCount = 0;
    private lastRecalculationTime = 0;

    constructor() {
        this.createAccountSyncs(0);
        this.activityAccumulator = new ActivityUpdateAccumulator(this.flushActivityUpdates.bind(this), 2000);

        // Listen for app state changes to refresh purchases
        AppState.addEventListener('change', (nextAppState) => {
            this.appState = nextAppState;
            if (!this.accountLifecycle.isActive()) {
                return;
            }
            if (nextAppState === 'active') {
                const shouldFailAfterResume = this.backgroundSendStartedAt !== null
                    && this.hasPendingOutboxMessages()
                    && (Date.now() - this.backgroundSendStartedAt) >= Sync.BACKGROUND_SEND_TIMEOUT_MS;
                void this.cancelBackgroundSendTimeoutNotification();
                this.clearBackgroundSendWatchdog();
                if (shouldFailAfterResume) {
                    void this.notifyMessageSendFailed();
                    this.failPendingOutboxMessages('Message failed to send in background after 30s. Please retry.');
                }
                log.log('📱 App became active');
                this.profileSync.invalidate();
                this.machinesSync.invalidate();
                this.pushTokenSync.invalidate();
                this.sessionsSync.invalidate();
                this.nativeUpdateSync.invalidate();
                log.log('📱 App became active: Invalidating artifacts sync');
                this.artifactsSync.invalidate();
            } else {
                log.log(`📱 App state changed to: ${nextAppState}`);
                this.maybeStartBackgroundSendWatchdog();
            }
        });
    }

    get encryption(): Encryption {
        if (!this._encryption) {
            throw new Error('Sync encryption is not initialized');
        }
        return this._encryption;
    }

    private createAccountSyncs(generation: number) {
        this.sessionsSync = new InvalidateSync(() => this.fetchSessions(generation));
        this.settingsSync = new InvalidateSync(() => this.syncSettings(generation));
        this.profileSync = new InvalidateSync(() => this.fetchProfile(generation));
        this.machinesSync = new InvalidateSync(() => this.fetchMachines(generation));
        this.nativeUpdateSync = new InvalidateSync(() => this.fetchNativeUpdate(generation));
        this.artifactsSync = new InvalidateSync(() => this.fetchArtifactsList(generation));

        const registerPushToken = async () => {
            if (__DEV__) {
                return;
            }
            if (!this.credentials) {
                return;
            }
            await this.registerPushToken(generation);
        }
        this.pushTokenSync = new InvalidateSync(registerPushToken);
    }

    async create(credentials: AuthCredentials, encryption: Encryption) {
        const generation = this.beginAccount();
        this.credentials = credentials;
        this._encryption = encryption;
        this.anonID = encryption.anonID;
        this.serverID = parseToken(credentials.token);
        await this.#init({ deferBackgroundSyncs: false, generation });

        // Await settings sync to have fresh settings
        await this.settingsSync.awaitQueue();

        // Await profile sync to have fresh profile
        await this.profileSync.awaitQueue();
    }

    async restore(credentials: AuthCredentials, encryption: Encryption) {
        // NOTE: No awaiting anything here, we're restoring from a disk (ie app restarted)
        // Purchases sync is invalidated in #init() and will complete asynchronously
        const generation = this.beginAccount();
        this.credentials = credentials;
        this._encryption = encryption;
        this.anonID = encryption.anonID;
        this.serverID = parseToken(credentials.token);
        await this.#init({ deferBackgroundSyncs: true, generation });
    }

    private beginAccount(): number {
        this.stopAccountSyncs();
        this.olderMessagesRetryGuard.clearAll();
        const generation = this.accountLifecycle.begin();
        this.createAccountSyncs(generation);
        return generation;
    }

    private stopAccountSyncs() {
        this.sessionsSync.stop();
        this.settingsSync.stop();
        this.profileSync.stop();
        this.machinesSync.stop();
        this.pushTokenSync.stop();
        this.nativeUpdateSync.stop();
        this.artifactsSync.stop();
        for (const sync of [...this.messagesSync.values(), ...this.sendSync.values(), ...this.olderMessagesSync.values()]) {
            sync.stop();
        }
    }

    async shutdown(): Promise<void> {
        this.accountLifecycle.end();
        this.cancelStartupSyncs?.();
        this.cancelStartupSyncs = null;
        this.stopAccountSyncs();
        this.clearBackgroundSendWatchdog();
        await this.cancelBackgroundSendTimeoutNotification();
        this.outbox.failAll();
        this.messageIngest.clearAll();
        this.activityAccumulator.reset();
        this.messagesSync.clear();
        this.sendSync.clear();
        this.olderMessagesSync.clear();
        this.olderMessagesRetryGuard.clearAll();
        this.sessionLastSeq.clear();
        this.sessionFirstSeq.clear();
        this.sessionHasMoreBefore.clear();
        this.missingSessionRefreshes.clear();
        this.sessionDataKeys.clear();
        this.machineDataKeys.clear();
        this.artifactDataKeys.clear();
        this.encryptionCache.clearAll();
        this.pendingSettings = {};
        savePendingSettings({});
        gitStatusSync.resetAll();
        projectManager.clear();
        fileSearchCache.clearCache();
        useFileTransferStore.getState().resetAccountTasks();
        apiSocket.reset();
        storage.getState().resetAccountState();
        this.credentials = null;
        this._encryption = null;
        this.serverID = '';
        this.anonID = '';
    }

    async #init(options: { deferBackgroundSyncs: boolean; generation: number }) {

        // Subscribe to updates
        this.subscribeToUpdates(options.generation);

        const startupSyncs: StartupSyncTask[] = [
            { name: 'sessions', run: () => this.accountLifecycle.runIfCurrent(options.generation, () => this.sessionsSync.invalidate()) },
            { name: 'settings', run: () => this.accountLifecycle.runIfCurrent(options.generation, () => this.settingsSync.invalidate()) },
            { name: 'profile', run: () => this.accountLifecycle.runIfCurrent(options.generation, () => this.profileSync.invalidate()) },
            { name: 'machines', run: () => this.accountLifecycle.runIfCurrent(options.generation, () => this.machinesSync.invalidate()) },
            { name: 'nativeUpdate', run: () => this.accountLifecycle.runIfCurrent(options.generation, () => this.nativeUpdateSync.invalidate()) },
            { name: 'artifacts', run: () => this.accountLifecycle.runIfCurrent(options.generation, () => this.artifactsSync.invalidate()) },
            { name: 'pushToken', run: () => this.accountLifecycle.runIfCurrent(options.generation, () => this.pushTokenSync.invalidate()) },
        ];

        this.cancelStartupSyncs?.();
        if (options.deferBackgroundSyncs) {
            this.cancelStartupSyncs = runStartupSyncs({
                immediate: startupSyncs.slice(0, 1),
                background: startupSyncs.slice(1),
                onBackgroundTaskError: (name, error) => {
                    console.warn(`Failed to schedule startup sync ${name}:`, error);
                },
            });
        } else {
            this.cancelStartupSyncs = runStartupSyncs({
                immediate: startupSyncs,
                background: [],
            });
        }

        // Mark UI ready as soon as sessions load. Machines sync may hang
        // when encryption keys are unavailable (e.g. V1 auth fallback) —
        // let it resolve in the background instead of blocking the UI.
        this.sessionsSync.awaitQueue().then(() => {
            this.accountLifecycle.runIfCurrent(options.generation, () => storage.getState().applyReady());
        }).catch((error) => {
            console.error('Failed to load sessions:', error);
            // Still mark ready so the UI doesn't stay on a blank screen forever
            this.accountLifecycle.runIfCurrent(options.generation, () => storage.getState().applyReady());
        });
    }


    onSessionVisible = (sessionId: string) => {
        storage.getState().applyMessagesLoadError(sessionId, null);
        this.getMessagesSync(sessionId).invalidate();

        // Also invalidate git status sync for this session
        gitStatusSync.getSync(sessionId).invalidate();

    }

    retryMessages = (sessionId: string) => {
        storage.getState().applyMessagesLoadError(sessionId, null);
        this.getMessagesSync(sessionId).invalidate();
    }

    private getMessagesSync(sessionId: string): InvalidateSync {
        let sync = this.messagesSync.get(sessionId);
        if (!sync) {
            const generation = this.requireAccountGeneration();
            sync = new InvalidateSync(() => this.fetchMessages(sessionId, generation));
            this.messagesSync.set(sessionId, sync);
        }
        return sync;
    }

    private getSendSync(sessionId: string): InvalidateSync {
        let sync = this.sendSync.get(sessionId);
        if (!sync) {
            const generation = this.requireAccountGeneration();
            sync = new InvalidateSync(() => this.flushOutbox(sessionId, generation));
            this.sendSync.set(sessionId, sync);
        }
        return sync;
    }

    loadOlderMessages = (sessionId: string) => {
        if (!this.sessionHasMoreBefore.get(sessionId)) {
            return;
        }
        const online = Platform.OS !== 'web' || typeof navigator === 'undefined' || navigator.onLine !== false;
        if (!this.olderMessagesRetryGuard.canStart(sessionId, { online })) {
            return;
        }
        let sync = this.olderMessagesSync.get(sessionId);
        if (!sync) {
            const generation = this.requireAccountGeneration();
            sync = new InvalidateSync(() => this.fetchOlderMessages(sessionId, generation));
            this.olderMessagesSync.set(sessionId, sync);
        }
        sync.invalidate();
    }

    private enqueueMessages(sessionId: string, messages: NormalizedMessage[]) {
        this.messageIngest.enqueue(sessionId, messages);
    }

    private requireAccountGeneration(): number {
        const generation = this.accountLifecycle.currentGeneration();
        if (generation === null) {
            throw new Error('Sync account is not active');
        }
        return generation;
    }

    private hasPendingOutboxMessages() {
        return this.outbox.hasPending();
    }

    private maybeStartBackgroundSendWatchdog() {
        if (Platform.OS === 'web' || this.appState === 'active') {
            return;
        }
        if (!this.hasPendingOutboxMessages() || this.backgroundSendTimeout) {
            return;
        }

        log.log('📨 Pending messages detected in background. Starting 30s send watchdog.');
        this.backgroundSendStartedAt = Date.now();
        this.backgroundSendTimeout = setTimeout(() => {
            this.backgroundSendTimeout = null;
            void this.handleBackgroundSendTimeout();
        }, Sync.BACKGROUND_SEND_TIMEOUT_MS);
        void this.scheduleBackgroundSendTimeoutNotification();
    }

    private clearBackgroundSendWatchdog() {
        if (this.backgroundSendTimeout) {
            clearTimeout(this.backgroundSendTimeout);
            this.backgroundSendTimeout = null;
        }
        this.backgroundSendStartedAt = null;
    }

    private async scheduleBackgroundSendTimeoutNotification() {
        if (Platform.OS === 'web' || this.backgroundSendNotificationId) {
            return;
        }
        try {
            this.backgroundSendNotificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Message not sent',
                    body: 'A message is still sending in the background. It will fail in 30 seconds if not delivered.',
                    sound: true
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: Math.ceil(Sync.BACKGROUND_SEND_TIMEOUT_MS / 1000)
                }
            });
        } catch (error) {
            log.log(`Failed to schedule background send timeout notification: ${error}`);
        }
    }

    private async cancelBackgroundSendTimeoutNotification() {
        if (!this.backgroundSendNotificationId) {
            return;
        }
        try {
            await Notifications.cancelScheduledNotificationAsync(this.backgroundSendNotificationId);
        } catch (error) {
            log.log(`Failed to cancel background send timeout notification: ${error}`);
        } finally {
            this.backgroundSendNotificationId = null;
        }
    }

    private async notifyMessageSendFailed() {
        if (Platform.OS === 'web') {
            return;
        }
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Message failed',
                    body: 'A message failed to send while the app was in background. Open AgentHub and retry.',
                    sound: true
                },
                trigger: null
            });
        } catch (error) {
            log.log(`Failed to schedule message failure notification: ${error}`);
        }
    }

    private failPendingOutboxMessages(reasonText: string) {
        const now = Date.now();
        const sessionIds = this.outbox.failAll();

        for (const sessionId of sessionIds) {
            this.enqueueMessages(sessionId, [{
                id: randomUUID(),
                localId: null,
                createdAt: now,
                role: 'event',
                isSidechain: false,
                content: {
                    type: 'message',
                    message: reasonText
                }
            }]);
        }
    }

    private async handleBackgroundSendTimeout() {
        if (!this.hasPendingOutboxMessages()) {
            await this.cancelBackgroundSendTimeoutNotification();
            this.backgroundSendStartedAt = null;
            return;
        }

        await this.cancelBackgroundSendTimeoutNotification();
        await this.notifyMessageSendFailed();
        this.failPendingOutboxMessages('Message failed to send in background after 30s. Please retry.');
        this.backgroundSendStartedAt = null;
    }

    async sendMessage(sessionId: string, text: string, options?: SendMessageOptions) {

        // Get encryption
        const encryption = this.encryption.getSessionEncryption(sessionId);
        if (!encryption) { // Should never happen
            console.error(`Session ${sessionId} not found`);
            return;
        }

        // Get session data from storage
        const session = storage.getState().sessions[sessionId];
        if (!session) {
            console.error(`Session ${sessionId} not found in storage`);
            return;
        }

        const { permissionMode, model, effort } = resolveMessageModeMeta(session);
        const { displayText, fileReferences, images, source = 'chat' } = options ?? {};

        // Generate local ID
        const localId = randomUUID();

        // Determine sentFrom based on platform
        let sentFrom: string;
        if (Platform.OS === 'web') {
            sentFrom = 'web';
        } else if (Platform.OS === 'android') {
            sentFrom = 'android';
        } else if (Platform.OS === 'ios') {
            // Check if running on Mac (Catalyst or Designed for iPad on Mac)
            if (isRunningOnMac()) {
                sentFrom = 'mac';
            } else {
                sentFrom = 'ios';
            }
        } else {
            sentFrom = 'web'; // fallback
        }

        const fallbackModel: string | null = null;

        // Create user message content with metadata
        const content: RawRecord = {
            role: 'user',
            content: {
                type: 'text',
                text
            },
            meta: {
                sentFrom,
                permissionMode,
                model,
                effort,
                fallbackModel,
                appendSystemPrompt: systemPrompt,
                ...(displayText && { displayText }),
                ...(fileReferences && fileReferences.length > 0 && { fileReferences }),
                ...(images && images.length > 0 && { images })
            }
        };
        const encryptedRawRecord = await encryption.encryptRawRecord(content);

        // Add to messages - normalize the raw record
        const createdAt = Date.now();
        const normalizedMessage = normalizeRawMessage(localId, localId, createdAt, content);
        if (normalizedMessage) {
            this.enqueueMessages(sessionId, [normalizedMessage]);
        }

        this.outbox.enqueue(sessionId, {
            localId,
            content: encryptedRawRecord
        });
        trackMessageSent(source, session.metadata);

        this.getSendSync(sessionId).invalidate();
        this.maybeStartBackgroundSendWatchdog();
    }

    /** Server sent us settings — merge any pending local changes on top, then apply as one update. */
    private applyServerSettings = (serverSettings: Settings, version: number) => {
        const merged = Object.keys(this.pendingSettings).length > 0
            ? applySettings(serverSettings, this.pendingSettings)
            : serverSettings;
        storage.getState().applySettings(merged, version);
    }

    applySettings = (delta: Partial<Settings>) => {
        storage.getState().applySettingsLocal(delta);

        // Save pending settings
        this.pendingSettings = { ...this.pendingSettings, ...delta };
        savePendingSettings(this.pendingSettings);

        // Invalidate settings sync
        this.settingsSync.invalidate();
    }

    refreshProfile = async () => {
        await this.profileSync.invalidateAndAwait();
    }

    //
    // Private
    //

    private fetchSessions = async (generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;
        const existingSessionIdsAtStart = Object.keys(storage.getState().sessions);

        const snapshot = await this.accountLifecycle.runRequest(generation, async (request) => {
            const sessions = await fetchCompleteCursorSnapshot<ApiSessionRecord>(async (cursor) => {
                const queryPath: string = cursor ? `?limit=200&cursor=${encodeURIComponent(cursor)}` : '?limit=200';
                const response: { status: number; data: ApiSessionPage } = await httpClient.request<ApiSessionPage>(credentials, `/v2/sessions${queryPath}`, {
                    signal: request.signal,
                });
                request.assertCurrent();
                return {
                    items: response.data.sessions,
                    nextCursor: response.data.nextCursor,
                    hasNext: response.data.hasNext,
                };
            });

            return {
                rawSessionIds: sessions.map((session) => session.id),
                decryptedSessions: await this.decryptSessions(sessions, request),
            };
        });

        this.accountLifecycle.assertCurrent(generation);
        const existingSessions = storage.getState().sessions;
        const reconciledSessions = reconcileSessionSnapshot({ ...snapshot, existingSessions, existingSessionIdsAtStart });
        if (snapshot.rawSessionIds.length === 0 && Object.keys(existingSessions).length > 0) {
            console.warn('Ignored an unexpected empty session snapshot; keeping the last known session list');
        }
        this.applySessions(reconciledSessions, true);
        log.log(`📥 fetchSessions completed - received ${snapshot.rawSessionIds.length}, processed ${snapshot.decryptedSessions.length}, retained ${reconciledSessions.length} sessions`);

    }

    private refreshMissingSession = (sessionId: string) => {
        const generation = this.requireAccountGeneration();
        const refreshKey = this.accountLifecycle.scopedKey(generation, sessionId);
        if (this.missingSessionRefreshes.has(refreshKey)) {
            return;
        }
        this.missingSessionRefreshes.add(refreshKey);
        void this.fetchSessions(generation)
            .catch((error) => {
                log.log(`Failed to refresh missing session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
            })
            .finally(() => {
                this.missingSessionRefreshes.delete(refreshKey);
            });
    }

    public refreshMachines = async () => {
        return this.fetchMachines(this.requireAccountGeneration());
    }

    public refreshSessions = async () => {
        return this.sessionsSync.invalidateAndAwait();
    }

    public ensureSessionLoaded = async (sessionId: string) => {
        const credentials = this.credentials;
        if (!credentials) return null;
        const generation = this.requireAccountGeneration();
        const existing = storage.getState().sessions[sessionId];
        if (existing) {
            return existing;
        }

        const decrypted = await this.accountLifecycle.runRequest(generation, async (request) => {
            const response = await httpClient.request<{ session?: ApiSessionRecord } | { missing?: boolean }>(credentials, `/v1/sessions/${sessionId}`, {
                signal: request.signal,
                acceptedStatuses: [404],
            });

            if (response.status === 404) {
                return null;
            }
            request.assertCurrent();
            const session = 'session' in response.data ? response.data.session : undefined;
            if (!session) {
                return null;
            }
            const [result] = await this.decryptSessions([session], request);
            return result ?? null;
        });
        if (!decrypted) {
            return null;
        }
        this.accountLifecycle.assertCurrent(generation);
        this.applySessions([decrypted]);
        return storage.getState().sessions[sessionId] ?? null;
    }

    public getCredentials() {
        return this.credentials;
    }

    // Artifact methods
    public fetchArtifactsList = async (generation = this.requireAccountGeneration()): Promise<void> => {
        log.log('📦 fetchArtifactsList: Starting artifact sync');
        const credentials = this.credentials;
        const encryption = this._encryption;
        if (!credentials || !encryption) {
            log.log('📦 fetchArtifactsList: No credentials, skipping');
            return;
        }

        try {
            log.log('📦 fetchArtifactsList: Fetching artifacts from server');
            const result = await this.accountLifecycle.runRequest(generation, async (request) => {
                const artifacts = await fetchArtifacts(credentials, request.signal);
                request.assertCurrent();
                log.log(`📦 fetchArtifactsList: Received ${artifacts.length} artifacts from server`);
                const decryptedArtifacts: DecryptedArtifact[] = [];
                const artifactKeys = new Map<string, Uint8Array>();

                for (const artifact of artifacts) {
                    try {
                        const decryptedKey = await encryption.decryptEncryptionKey(artifact.dataEncryptionKey);
                        request.assertCurrent();
                        if (!decryptedKey) {
                            console.error(`Failed to decrypt key for artifact ${artifact.id}`);
                            continue;
                        }
                        artifactKeys.set(artifact.id, decryptedKey);
                        const artifactEncryption = new ArtifactEncryption(decryptedKey);
                        const header = await artifactEncryption.decryptHeader(artifact.header);
                        request.assertCurrent();
                        decryptedArtifacts.push({
                            id: artifact.id,
                            title: header?.title || null,
                            sessions: header?.sessions,
                            draft: header?.draft,
                            body: undefined,
                            headerVersion: artifact.headerVersion,
                            bodyVersion: artifact.bodyVersion,
                            seq: artifact.seq,
                            createdAt: artifact.createdAt,
                            updatedAt: artifact.updatedAt,
                            isDecrypted: !!header,
                        });
                    } catch (err) {
                        request.assertCurrent();
                        console.error(`Failed to decrypt artifact ${artifact.id}:`, err);
                        decryptedArtifacts.push({
                            id: artifact.id,
                            title: null,
                            body: undefined,
                            headerVersion: artifact.headerVersion,
                            seq: artifact.seq,
                            createdAt: artifact.createdAt,
                            updatedAt: artifact.updatedAt,
                            isDecrypted: false,
                        });
                    }
                }
                return { decryptedArtifacts, artifactKeys };
            });

            this.accountLifecycle.assertCurrent(generation);
            for (const [artifactId, key] of result.artifactKeys) {
                this.artifactDataKeys.set(artifactId, key);
            }
            log.log(`📦 fetchArtifactsList: Successfully decrypted ${result.decryptedArtifacts.length} artifacts`);
            storage.getState().applyArtifacts(result.decryptedArtifacts);
            log.log('📦 fetchArtifactsList: Artifacts applied to storage');
        } catch (error) {
            log.log(`📦 fetchArtifactsList: Error fetching artifacts: ${error}`);
            if (shouldReportSyncError(error)) {
                console.error('Failed to fetch artifacts:', error);
            }
            throw error;
        }
    }

    public async fetchArtifactWithBody(artifactId: string): Promise<DecryptedArtifact> {
        const credentials = this.credentials;
        const encryption = this._encryption;
        if (!credentials || !encryption) {
            throw new Error('Not authenticated');
        }
        const generation = this.requireAccountGeneration();

        const result = await this.accountLifecycle.runRequest(generation, async (request) => {
            const artifact = await fetchArtifact(credentials, artifactId, request.signal);
            request.assertCurrent();

            const decryptedKey = await encryption.decryptEncryptionKey(artifact.dataEncryptionKey);
            request.assertCurrent();
            if (!decryptedKey) {
                throw new Error(`Failed to decrypt key for artifact ${artifactId}`);
            }

            const artifactEncryption = new ArtifactEncryption(decryptedKey);
            const header = await artifactEncryption.decryptHeader(artifact.header);
            const body = artifact.body ? await artifactEncryption.decryptBody(artifact.body) : null;
            request.assertCurrent();
            if (!header) {
                throw new Error(`Failed to decrypt header for artifact ${artifactId}`);
            }
            if (artifact.body && !body) {
                throw new Error(`Failed to decrypt body for artifact ${artifactId}`);
            }

            return {
                artifact: {
                    id: artifact.id,
                    title: header.title || null,
                    sessions: header.sessions,
                    draft: header.draft,
                    body: body?.body || null,
                    headerVersion: artifact.headerVersion,
                    bodyVersion: artifact.bodyVersion,
                    seq: artifact.seq,
                    createdAt: artifact.createdAt,
                    updatedAt: artifact.updatedAt,
                    isDecrypted: true,
                } satisfies DecryptedArtifact,
                decryptedKey,
            };
        });
        this.accountLifecycle.assertCurrent(generation);
        this.artifactDataKeys.set(result.artifact.id, result.decryptedKey);
        return result.artifact;
    }

    public async createArtifact(
        title: string | null, 
        body: string | null,
        sessions?: string[],
        draft?: boolean
    ): Promise<string> {
        const credentials = this.credentials;
        const encryption = this._encryption;
        if (!credentials || !encryption) {
            throw new Error('Not authenticated');
        }
        const generation = this.requireAccountGeneration();

        try {
            const result = await this.accountLifecycle.runRequest(generation, async (accountRequest) => {
                const artifactId = encryption.generateId();
                const dataEncryptionKey = ArtifactEncryption.generateDataEncryptionKey();
                const encryptedKey = await encryption.encryptEncryptionKey(dataEncryptionKey);
                accountRequest.assertCurrent();
                const artifactEncryption = new ArtifactEncryption(dataEncryptionKey);
                const encryptedHeader = await artifactEncryption.encryptHeader({ title, sessions, draft });
                const encryptedBody = await artifactEncryption.encryptBody({ body });
                accountRequest.assertCurrent();
                const request: ArtifactCreateRequest = {
                    id: artifactId,
                    header: encryptedHeader,
                    body: encryptedBody,
                    dataEncryptionKey: encodeBase64(encryptedKey, 'base64'),
                };
                const artifact = await createArtifact(credentials, request, accountRequest.signal);
                return {
                    artifactId,
                    dataEncryptionKey,
                    decryptedArtifact: {
                        id: artifact.id,
                        title,
                        sessions,
                        draft,
                        body,
                        headerVersion: artifact.headerVersion,
                        bodyVersion: artifact.bodyVersion,
                        seq: artifact.seq,
                        createdAt: artifact.createdAt,
                        updatedAt: artifact.updatedAt,
                        isDecrypted: true,
                    } satisfies DecryptedArtifact,
                };
            });
            this.accountLifecycle.assertCurrent(generation);
            this.artifactDataKeys.set(result.artifactId, result.dataEncryptionKey);
            storage.getState().addArtifact(result.decryptedArtifact);
            return result.artifactId;
        } catch (error) {
            console.error('Failed to create artifact:', error);
            throw error;
        }
    }

    public async updateArtifact(
        artifactId: string, 
        title: string | null, 
        body: string | null,
        sessions?: string[],
        draft?: boolean
    ): Promise<void> {
        const credentials = this.credentials;
        const encryption = this._encryption;
        if (!credentials || !encryption) {
            throw new Error('Not authenticated');
        }
        const generation = this.requireAccountGeneration();

        try {
            // Get current artifact to get versions and encryption key
            const currentArtifact = storage.getState().artifacts[artifactId];
            if (!currentArtifact) {
                throw new Error('Artifact not found');
            }

            // Get the data encryption key from memory or fetch it
            const result = await this.accountLifecycle.runRequest(generation, async (accountRequest) => {
                let dataEncryptionKey = this.artifactDataKeys.get(artifactId);
                let headerVersion = currentArtifact.headerVersion;
                let bodyVersion = currentArtifact.bodyVersion;

                if (headerVersion === undefined || bodyVersion === undefined || !dataEncryptionKey) {
                    const fullArtifact = await fetchArtifact(credentials, artifactId, accountRequest.signal);
                    accountRequest.assertCurrent();
                    headerVersion = fullArtifact.headerVersion;
                    bodyVersion = fullArtifact.bodyVersion;
                    if (!dataEncryptionKey) {
                        const decryptedKey = await encryption.decryptEncryptionKey(fullArtifact.dataEncryptionKey);
                        accountRequest.assertCurrent();
                        if (!decryptedKey) {
                            throw new Error('Failed to decrypt encryption key');
                        }
                        dataEncryptionKey = decryptedKey;
                    }
                }

                const artifactEncryption = new ArtifactEncryption(dataEncryptionKey);
                const updateRequest: ArtifactUpdateRequest = {};
                if (title !== currentArtifact.title ||
                    JSON.stringify(sessions) !== JSON.stringify(currentArtifact.sessions) ||
                    draft !== currentArtifact.draft) {
                    updateRequest.header = await artifactEncryption.encryptHeader({ title, sessions, draft });
                    updateRequest.expectedHeaderVersion = headerVersion;
                }
                if (body !== currentArtifact.body) {
                    updateRequest.body = await artifactEncryption.encryptBody({ body });
                    updateRequest.expectedBodyVersion = bodyVersion;
                }
                accountRequest.assertCurrent();
                if (Object.keys(updateRequest).length === 0) {
                    return null;
                }
                const response = await updateArtifact(credentials, artifactId, updateRequest, accountRequest.signal);
                if (!response.success) {
                    if (response.error === 'version-mismatch') {
                        throw new Error('Artifact was modified by another client. Please refresh and try again.');
                    }
                    throw new Error('Failed to update artifact');
                }
                return {
                    dataEncryptionKey,
                    updatedArtifact: {
                        ...currentArtifact,
                        title,
                        sessions,
                        draft,
                        body,
                        headerVersion: response.headerVersion !== undefined ? response.headerVersion : headerVersion,
                        bodyVersion: response.bodyVersion !== undefined ? response.bodyVersion : bodyVersion,
                        updatedAt: Date.now(),
                    } satisfies DecryptedArtifact,
                };
            });
            if (!result) return;
            this.accountLifecycle.assertCurrent(generation);
            this.artifactDataKeys.set(artifactId, result.dataEncryptionKey);
            storage.getState().updateArtifact(result.updatedArtifact);
        } catch (error) {
            console.error('Failed to update artifact:', error);
            throw error;
        }
    }

    private fetchMachines = async (generation: number) => {
        const credentials = this.credentials;
        const encryption = this._encryption;
        if (!credentials || !encryption) return;
        const existingMachineIdsAtStart = Object.keys(storage.getState().machines);

        const result = await this.accountLifecycle.runRequest(generation, async (request) => {
            const response = await httpClient.request<Array<{
                id: string;
                metadata: string;
                metadataVersion: number;
                daemonState?: string | null;
                daemonStateVersion?: number;
                dataEncryptionKey?: string | null;
                seq: number;
                active: boolean;
                activeAt: number;
                createdAt: number;
                updatedAt: number;
            }>>(credentials, '/v1/machines', {
                signal: request.signal,
            });
            const machines = response.data;
            request.assertCurrent();

            const machineKeysMap = new Map<string, Uint8Array | null>();
            const decryptedMachineKeys = new Map<string, Uint8Array>();
            const failedMachineIds = new Set<string>();
            for (const machine of machines) {
                if (machine.dataEncryptionKey) {
                    const decryptedKey = await encryption.decryptEncryptionKey(machine.dataEncryptionKey);
                    request.assertCurrent();
                    if (!decryptedKey) {
                        console.error(`Failed to decrypt data encryption key for machine ${machine.id}`);
                        failedMachineIds.add(machine.id);
                        continue;
                    }
                    machineKeysMap.set(machine.id, decryptedKey);
                    decryptedMachineKeys.set(machine.id, decryptedKey);
                } else {
                    machineKeysMap.set(machine.id, null);
                }
            }
            await encryption.initializeMachines(machineKeysMap);
            request.assertCurrent();

            const decryptedMachines: Machine[] = [];

            for (const machine of machines) {
                const machineEncryption = encryption.getMachineEncryption(machine.id);
                if (!machineEncryption) {
                    console.error(`Machine encryption not found for ${machine.id} - this should never happen`);
                    continue;
                }

                try {
                    const metadata = machine.metadata
                        ? await machineEncryption.decryptMetadata(machine.metadataVersion, machine.metadata)
                        : null;

                    const daemonState = machine.daemonState
                        ? await machineEncryption.decryptDaemonState(machine.daemonStateVersion || 0, machine.daemonState)
                        : null;
                    request.assertCurrent();

                    decryptedMachines.push({
                        id: machine.id, seq: machine.seq, createdAt: machine.createdAt, updatedAt: machine.updatedAt,
                        active: machine.active, activeAt: machine.activeAt, metadata,
                        metadataVersion: machine.metadataVersion, daemonState,
                        daemonStateVersion: machine.daemonStateVersion || 0
                    });
                } catch (error) {
                    request.assertCurrent();
                    console.error(`Failed to decrypt machine ${machine.id}:`, error);
                    failedMachineIds.add(machine.id);
                    decryptedMachines.push({
                        id: machine.id, seq: machine.seq, createdAt: machine.createdAt, updatedAt: machine.updatedAt,
                        active: machine.active, activeAt: machine.activeAt, metadata: null,
                        metadataVersion: machine.metadataVersion, daemonState: null, daemonStateVersion: 0
                    });
                }
            }
            return {
                rawMachineIds: machines.map((machine) => machine.id),
                decryptedMachines,
                decryptedMachineKeys,
                failedMachineIds: [...failedMachineIds],
            };
        });

        if (!result) return;
        this.accountLifecycle.assertCurrent(generation);
        for (const [machineId, key] of result.decryptedMachineKeys) {
            this.machineDataKeys.set(machineId, key);
        }
        const existingMachines = storage.getState().machines;
        const reconciledMachines = reconcileMachineSnapshot({
            ...result,
            existingMachines,
            existingMachineIdsAtStart,
        });
        storage.getState().applyMachines(reconciledMachines, true);
        log.log(`🖥️ fetchMachines completed - received ${result.rawMachineIds.length}, processed ${result.decryptedMachines.length}, retained ${reconciledMachines.length} machines`);
    }

    private syncSettings = async (generation: number) => {
        const credentials = this.credentials;
        const encryption = this._encryption;
        if (!credentials || !encryption) return;

        const maxRetries = 3;
        let retryCount = 0;

        // Apply pending settings
        if (Object.keys(this.pendingSettings).length > 0) {

            while (retryCount < maxRetries) {
                // Snapshot what we're about to send so we can detect concurrent changes
                const sentPending = { ...this.pendingSettings };
                let version = storage.getState().settingsVersion;
                let settings = applySettings(storage.getState().settings, this.pendingSettings);
                const encryptedSettings = await encryption.encryptRaw(settings);
                this.accountLifecycle.assertCurrent(generation);
                const data = await this.accountLifecycle.runRequest(generation, async (request) => {
                    const response = await httpClient.request<{
                        success: false;
                        error: string;
                        currentVersion: number;
                        currentSettings: string | null;
                    } | { success: true }>(credentials, '/v1/account/settings', {
                        method: 'POST',
                        signal: request.signal,
                        body: { settings: encryptedSettings, expectedVersion: version ?? 0 },
                    });
                    return response.data;
                });
                if (data.success) {
                    this.accountLifecycle.assertCurrent(generation);
                    // Only clear keys we actually sent — preserve any settings
                    // added by applySettings() calls during the POST roundtrip
                    const newPending: Partial<Settings> = {};
                    for (const key of Object.keys(this.pendingSettings) as (keyof Settings)[]) {
                        if (!(key in sentPending) || this.pendingSettings[key] !== sentPending[key]) {
                            (newPending as any)[key] = this.pendingSettings[key];
                        }
                    }
                    this.pendingSettings = newPending;
                    savePendingSettings(this.pendingSettings);
                    break;
                }
                if (data.error === 'version-mismatch') {
                    // Parse server settings
                    const serverSettings = data.currentSettings
                        ? settingsParse(await encryption.decryptRaw(data.currentSettings))
                        : { ...settingsDefaults };
                    this.accountLifecycle.assertCurrent(generation);

                    // Merge: server base + our pending changes (our changes win)
                    const mergedSettings = applySettings(serverSettings, this.pendingSettings);

                    // Update local storage with merged result at server's version
                    this.applyServerSettings(mergedSettings, data.currentVersion);

                    retryCount++;
                    continue;
                } else {
                    throw new Error(`Failed to sync settings: ${data.error}`);
                }
            }
        }

        // If exhausted retries, throw to trigger outer backoff delay
        if (retryCount >= maxRetries) {
            throw new Error(`Settings sync failed after ${maxRetries} retries due to version conflicts`);
        }

        // Run request
        const data = await this.accountLifecycle.runRequest(generation, async (request) => {
            const response = await httpClient.request<{
                settings: string | null;
                settingsVersion: number;
            }>(credentials, '/v1/account/settings', {
                signal: request.signal,
            });
            return response.data;
        });

        // Parse response
        let parsedSettings: Settings;
        if (data.settings) {
            parsedSettings = settingsParse(await encryption.decryptRaw(data.settings));
        } else {
            parsedSettings = { ...settingsDefaults };
        }

        // Apply settings to storage, re-layering any pending local changes on top
        this.accountLifecycle.assertCurrent(generation);
        this.applyServerSettings(parsedSettings, data.settingsVersion);
    }

    private fetchProfile = async (generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;

        const parsedProfile = await this.accountLifecycle.runRequest(generation, async (request) => {
            const response = await httpClient.request(credentials, '/v1/account/profile', {
                signal: request.signal,
            });
            return profileParse(response.data);
        });
        this.accountLifecycle.assertCurrent(generation);
        storage.getState().applyProfile(parsedProfile);
    }

    private fetchNativeUpdate = async (generation: number) => {
        try {
            // Skip in development
            if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !Constants.expoConfig?.version) {
                return;
            }
            if (Platform.OS === 'ios' && !Constants.expoConfig?.ios?.bundleIdentifier) {
                return;
            }
            if (Platform.OS === 'android' && !Constants.expoConfig?.android?.package) {
                return;
            }

            const serverUrl = getServerUrl();

            // Get platform and app identifiers
            const platform = Platform.OS;
            const version = Constants.expoConfig?.version!;
            const appId = (Platform.OS === 'ios' ? Constants.expoConfig?.ios?.bundleIdentifier! : Constants.expoConfig?.android?.package!);

            const status = await this.accountLifecycle.runRequest(generation, async (request) => {
                const abortScope = createAbortScope(request.signal, 15_000);
                try {
                    const response = await fetch(`${serverUrl}/v1/version`, {
                        method: 'POST',
                        signal: abortScope.signal,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-AgentHub-Client': getAgentHubClientId(),
                        },
                        body: JSON.stringify({ platform, version, app_id: appId }),
                    });
                    if (!response.ok) {
                        console.warn(`[fetchNativeUpdate] Request failed: ${response.status}`);
                        return null;
                    }
                    const data = await response.json();
                    return data.update_required && data.update_url
                        ? { available: true, updateUrl: data.update_url as string }
                        : { available: false };
                } finally {
                    abortScope.cleanup();
                }
            });
            if (status) {
                this.accountLifecycle.assertCurrent(generation);
                storage.getState().applyNativeUpdateStatus(status);
            }
        } catch (error) {
            if (!this.accountLifecycle.isCurrent(generation)) {
                return;
            }
            console.warn('[fetchNativeUpdate] Error:', error);
            storage.getState().applyNativeUpdateStatus(null);
        }
    }

    private flushOutbox = async (sessionId: string, generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;
        const pending = this.outbox.getPending(sessionId);
        if (!pending || pending.length === 0) {
            if (!this.hasPendingOutboxMessages()) {
                this.clearBackgroundSendWatchdog();
                await this.cancelBackgroundSendTimeoutNotification();
                this.backgroundSendStartedAt = null;
            }
            return;
        }

        const batch = pending.slice();
        const controller = this.outbox.startSend(sessionId);
        try {
            const data = await this.accountLifecycle.runRequest(generation, async (request) => {
                const abortSend = () => controller.abort();
                request.signal.addEventListener('abort', abortSend, { once: true });
                try {
                    const response = await httpClient.request<V3PostSessionMessagesResponse>(credentials, `/v3/sessions/${sessionId}/messages`, {
                        method: 'POST',
                        body: {
                            messages: batch.map((message) => ({
                                localId: message.localId,
                                content: message.content
                            }))
                        },
                        signal: controller.signal
                    });
                    return response.data;
                } finally {
                    request.signal.removeEventListener('abort', abortSend);
                }
            });
            this.accountLifecycle.assertCurrent(generation);
            pending.splice(0, batch.length);
            if (Array.isArray(data.messages) && data.messages.length > 0) {
                const currentLastSeq = this.sessionLastSeq.get(sessionId) ?? 0;
                let maxSeq = currentLastSeq;
                for (const message of data.messages) {
                    if (message.seq > maxSeq) {
                        maxSeq = message.seq;
                    }
                }
                this.sessionLastSeq.set(sessionId, maxSeq);
            }
        } catch (error) {
            if (this.accountLifecycle.isCurrent(generation)) {
                this.maybeStartBackgroundSendWatchdog();
            }
            throw error;
        } finally {
            this.outbox.finishSend(sessionId, controller);
        }

        if (pending.length === 0) {
            this.outbox.deletePending(sessionId);
        }
        if (!this.hasPendingOutboxMessages()) {
            this.clearBackgroundSendWatchdog();
            await this.cancelBackgroundSendTimeoutNotification();
            this.backgroundSendStartedAt = null;
        } else if (this.appState !== 'active') {
            this.maybeStartBackgroundSendWatchdog();
        }
    }

    private fetchMessages = async (sessionId: string, generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;
        log.log(`💬 fetchMessages starting for session ${sessionId} - acquiring lock`);
        try {
            await this.accountLifecycle.runRequest(generation, async (request) => {
                const lock = this.messageIngest.lock(sessionId);
                await lock.inLock(async () => {
                    request.assertCurrent();
                    const encryption = this.encryption.getSessionEncryption(sessionId);
                    if (!encryption) {
                        log.log(`💬 fetchMessages: Session encryption not ready for ${sessionId}, will retry`);
                        throw new Error(`Session encryption not ready for ${sessionId}`);
                    }

                    let afterSeq = this.sessionLastSeq.get(sessionId) ?? 0;
                    const hasLocalMessages = !!storage.getState().sessionMessages[sessionId]?.messages.length;
                    if (afterSeq === 0 && !hasLocalMessages) {
                        const data = (await httpClient.request<V3GetSessionMessagesResponse>(credentials, `/v3/sessions/${sessionId}/messages?direction=backward&limit=100`, { signal: request.signal })).data;
                        const processed = await this.processMessagePage(sessionId, Array.isArray(data.messages) ? data.messages : [], request);
                        request.assertCurrent();
                        if (processed.normalizedMessages.length > 0) {
                            this.applyMessages(sessionId, processed.normalizedMessages);
                        }

                        if (processed.maxSeq !== null) {
                            this.sessionLastSeq.set(sessionId, processed.maxSeq);
                        }
                        if (processed.minSeq !== null) {
                            this.sessionFirstSeq.set(sessionId, processed.minSeq);
                        }
                        this.sessionHasMoreBefore.set(sessionId, !!data.hasMore);
                        this.olderMessagesRetryGuard.recordSuccess(sessionId);
                        storage.getState().applyMessageHistoryState(sessionId, {
                            hasMoreBefore: !!data.hasMore,
                            isLoadingBefore: false,
                        });
                        this.applyLifecycleThinkingState(sessionId, processed.lifecycleThinkingState);
                        storage.getState().applyMessagesLoaded(sessionId);
                        log.log(`💬 fetchMessages completed latest page for session ${sessionId} - processed ${processed.normalizedMessages.length} messages`);
                        return;
                    }

                    let hasMore = true;
                    let totalNormalized = 0;
                    let lifecycleThinkingState: boolean | null = null;
                    const catchup = new MessageCatchupBuffer<NormalizedMessage>(
                        MESSAGE_CATCHUP_COMMIT_SIZE,
                        ({ messages, minSeq, maxSeq }) => {
                            request.assertCurrent();
                            if (messages.length > 0) {
                                this.applyMessages(sessionId, messages);
                            }
                            if (minSeq !== null) {
                                const currentFirstSeq = this.sessionFirstSeq.get(sessionId);
                                this.sessionFirstSeq.set(
                                    sessionId,
                                    currentFirstSeq === undefined ? minSeq : Math.min(currentFirstSeq, minSeq),
                                );
                            }
                            if (maxSeq !== null) {
                                this.sessionLastSeq.set(sessionId, maxSeq);
                            }
                        },
                    );

                    while (hasMore) {
                        const data = (await httpClient.request<V3GetSessionMessagesResponse>(credentials, `/v3/sessions/${sessionId}/messages?after_seq=${afterSeq}&limit=100`, { signal: request.signal })).data;
                        const messages = Array.isArray(data.messages) ? data.messages : [];
                        const processed = await this.processMessagePage(sessionId, messages, request);
                        request.assertCurrent();
                        const maxSeq = processed.maxSeq ?? afterSeq;
                        if (processed.lifecycleThinkingState !== null) {
                            lifecycleThinkingState = processed.lifecycleThinkingState;
                        }

                        if (processed.normalizedMessages.length > 0) {
                            totalNormalized += processed.normalizedMessages.length;
                        }
                        catchup.push(processed.normalizedMessages, {
                            minSeq: processed.minSeq,
                            maxSeq: processed.maxSeq,
                        });

                        hasMore = !!data.hasMore;
                        if (hasMore && maxSeq === afterSeq) {
                            log.log(`💬 fetchMessages: pagination stalled for ${sessionId}, stopping to avoid infinite loop`);
                            break;
                        }
                        afterSeq = maxSeq;
                    }

                    request.assertCurrent();
                    catchup.flush();

                    this.applyLifecycleThinkingState(sessionId, lifecycleThinkingState);

                    storage.getState().applyMessagesLoaded(sessionId);
                    log.log(`💬 fetchMessages completed for session ${sessionId} - processed ${totalNormalized} messages`);
                });
            });
        } catch (error) {
            const loadError = classifySessionMessageLoadError(error);
            if (loadError && this.accountLifecycle.isCurrent(generation)) {
                storage.getState().applyMessagesLoadError(sessionId, loadError);
            }
            throw error;
        }
    }

    private fetchOlderMessages = async (sessionId: string, generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;
        const beforeSeq = this.sessionFirstSeq.get(sessionId);
        if (!beforeSeq || !this.sessionHasMoreBefore.get(sessionId)) {
            return;
        }

        storage.getState().applyMessageHistoryState(sessionId, { isLoadingBefore: true });
        log.log(`💬 fetchOlderMessages starting for session ${sessionId} before seq ${beforeSeq}`);

        await this.accountLifecycle.runRequest(generation, async (request) => {
          const lock = this.messageIngest.lock(sessionId);
          await lock.inLock(async () => {
            try {
                request.assertCurrent();
                const data = (await httpClient.request<V3GetSessionMessagesResponse>(credentials, `/v3/sessions/${sessionId}/messages?direction=backward&before_seq=${beforeSeq}&limit=100`, { signal: request.signal })).data;
                const processed = await this.processMessagePage(sessionId, Array.isArray(data.messages) ? data.messages : [], request);
                request.assertCurrent();

                if (processed.normalizedMessages.length > 0) {
                    this.applyMessages(sessionId, processed.normalizedMessages);
                }

                if (processed.minSeq !== null) {
                    this.sessionFirstSeq.set(sessionId, processed.minSeq);
                }
                if (processed.maxSeq !== null) {
                    const currentLastSeq = this.sessionLastSeq.get(sessionId) ?? 0;
                    this.sessionLastSeq.set(sessionId, Math.max(currentLastSeq, processed.maxSeq));
                }

                this.sessionHasMoreBefore.set(sessionId, !!data.hasMore);
                storage.getState().applyMessageHistoryState(sessionId, {
                    hasMoreBefore: !!data.hasMore,
                    isLoadingBefore: false,
                });
                log.log(`💬 fetchOlderMessages completed for session ${sessionId} - processed ${processed.normalizedMessages.length} messages`);
            } catch (error) {
                this.olderMessagesRetryGuard.recordFailure(sessionId);
                if (this.accountLifecycle.isCurrent(generation)) {
                    storage.getState().applyMessageHistoryState(sessionId, { isLoadingBefore: false });
                }
                throw error;
            }
          });
        });
    }

    private processMessagePage = async (sessionId: string, messages: ApiMessage[], request: AccountRequest): Promise<ProcessedMessagePage> => {
        request.assertCurrent();
        const accountEncryption = this._encryption;
        if (!accountEncryption) {
            throw new DOMException('Account lifecycle is stale', 'AbortError');
        }
        const encryption = accountEncryption.getSessionEncryption(sessionId);
        if (!encryption) {
            throw new Error(`Session encryption not ready for ${sessionId}`);
        }

        let minSeq: number | null = null;
        let maxSeq: number | null = null;
        for (const message of messages) {
            minSeq = minSeq === null ? message.seq : Math.min(minSeq, message.seq);
            maxSeq = maxSeq === null ? message.seq : Math.max(maxSeq, message.seq);
        }

        const decryptedMessages = await encryption.decryptMessages(messages);
        request.assertCurrent();
        const normalizedMessages: NormalizedMessage[] = [];
        let lifecycleThinkingState: boolean | null = null;
        for (const decrypted of decryptedMessages) {
            if (!decrypted) {
                continue;
            }
            const nextLifecycleThinkingState = getLifecycleThinkingStateFromRawContent(decrypted.content);
            if (nextLifecycleThinkingState !== null) {
                lifecycleThinkingState = nextLifecycleThinkingState;
            }
            const normalized = normalizeRawMessage(decrypted.id, decrypted.localId, decrypted.createdAt, decrypted.content);
            if (normalized) {
                normalizedMessages.push(normalized);
            }
        }

        return {
            normalizedMessages,
            minSeq,
            maxSeq,
            lifecycleThinkingState,
        };
    }

    private applyLifecycleThinkingState(sessionId: string, lifecycleThinkingState: boolean | null) {
        if (lifecycleThinkingState === null) {
            return;
        }
        const session = storage.getState().sessions[sessionId];
        if (session && session.thinking !== lifecycleThinkingState) {
            this.applySessions([{
                ...session,
                thinking: lifecycleThinkingState,
                thinkingAt: Date.now(),
            }]);
        }
    }

    private registerPushToken = async (generation: number) => {
        log.log('registerPushToken');
        const credentials = this.credentials;
        if (!credentials) {
            return;
        }
        try {
            const result = await this.accountLifecycle.runRequest(generation, (request) => (
                syncCurrentPushToken(credentials, request.signal)
            ));
            log.log('Push token sync result: ' + JSON.stringify({
                registered: result.registered,
                hasToken: !!result.token,
                permission: result.permission.status,
            }));
            if (!result.permission.granted) {
                console.warn('Failed to get push token for push notification!');
            }
        } catch (error) {
            log.log('Failed to register push token: ' + JSON.stringify(error));
        }
    }

    private subscribeToUpdates = (generation: number) => {
        // Subscribe to message updates
        apiSocket.onMessage('update', (update) => {
            void this.handleUpdate(update, generation).catch((error) => {
                if (this.accountLifecycle.isCurrent(generation)) {
                    console.error('Failed to handle account update:', error);
                }
            });
        });
        apiSocket.onMessage('ephemeral', (update) => this.handleEphemeralUpdate(update, generation));

        // Subscribe to connection state changes
        apiSocket.onReconnected(() => {
            if (!this.accountLifecycle.isCurrent(generation)) {
                return;
            }
            log.log('🔌 Socket reconnected');
            this.sessionsSync.invalidate();
            this.machinesSync.invalidate();
            log.log('🔌 Socket reconnected: Invalidating artifacts sync');
            this.artifactsSync.invalidate();
            // Messages are fetched lazily per-session via onSessionVisible (called by SessionView
            // when realtimeStatus changes). Session metadata + agentState (including permission
            // requests) are already refreshed by sessionsSync.invalidate() above.
            for (const sync of this.sendSync.values()) {
                sync.invalidate();
            }
        });
    }

    private handleUpdate = async (update: unknown, generation: number) => {
        this.accountLifecycle.assertCurrent(generation);
        const validatedUpdate = ApiUpdateContainerSchema.safeParse(update);
        if (!validatedUpdate.success) {
            console.warn('❌ Sync: Invalid update received:', validatedUpdate.error);
            console.error('❌ Sync: Invalid update data:', update);
            return;
        }
        const updateData = validatedUpdate.data;

        if (updateData.body.t === 'new-message') {
            const sessionId = updateData.body.sid;
            const session = storage.getState().sessions[sessionId];
            const encryption = this.encryption.getSessionEncryption(sessionId);

            // Get encryption
            if (handleMissingSessionForUpdate({
                sessionId,
                updateType: 'new-message',
                hasSession: Boolean(session),
                hasEncryption: Boolean(encryption),
                fetchSessions: () => this.refreshMissingSession(sessionId),
            })) {
                return;
            }
            if (!encryption) {
                return;
            }

            // Decrypt message
            let lastMessage: NormalizedMessage | null = null;
            if (updateData.body.message) {
                const decrypted = await encryption.decryptMessage(updateData.body.message);
                this.accountLifecycle.assertCurrent(generation);
                if (decrypted) {
                    lastMessage = normalizeRawMessage(decrypted.id, decrypted.localId, decrypted.createdAt, decrypted.content);

                    // Check for task lifecycle events to update thinking state.
                    // This keeps UI state correct even if volatile activity updates are lost.
                    const lifecycleThinkingState = getLifecycleThinkingStateFromRawContent(decrypted.content);

                    // Update session
                    const latestSession = storage.getState().sessions[sessionId];
                    if (latestSession) {
                        this.applySessions([{
                            ...latestSession,
                            updatedAt: updateData.createdAt,
                            seq: updateData.seq,
                            // Update thinking state based on task lifecycle events
                            ...(lifecycleThinkingState !== null ? {
                                thinking: lifecycleThinkingState,
                                thinkingAt: Date.now(),
                            } : {}),
                        }])
                    } else {
                        // Fetch sessions again if we don't have this session
                        this.refreshMissingSession(sessionId);
                    }

                    // Fast-path only on consecutive seq values, otherwise fetch from server.
                    const currentLastSeq = this.sessionLastSeq.get(sessionId);
                    const incomingSeq = updateData.body.message.seq;
                    if (lastMessage && currentLastSeq !== undefined && incomingSeq === currentLastSeq + 1) {
                        this.enqueueMessages(sessionId, [lastMessage]);
                        this.sessionLastSeq.set(sessionId, incomingSeq);
                        let hasMutableTool = false;
                        if (lastMessage.role === 'agent' && lastMessage.content[0] && lastMessage.content[0].type === 'tool-result') {
                            hasMutableTool = storage.getState().isMutableToolCall(sessionId, lastMessage.content[0].tool_use_id);
                        }
                        if (hasMutableTool) {
                            gitStatusSync.invalidate(sessionId);
                        }
                    } else {
                        this.getMessagesSync(sessionId).invalidate();
                    }
                }
            }

            // NOTE: Removed onSessionVisible call here. Previously this triggered a
            // full fetchSessions on every new-message update, which reset the thinking
            // state to false and caused the thinking animation to flicker. The fast-path
            // message delivery above + InvalidateSync for messages handles data freshness.

        } else if (updateData.body.t === 'new-session') {
            log.log('🆕 New session update received');
            await this.ensureSessionLoaded(updateData.body.id);
        } else if (updateData.body.t === 'delete-session') {
            log.log('🗑️ Delete session update received');
            const sessionId = updateData.body.sid;

            // Remove session from storage
            storage.getState().deleteSession(sessionId);

            // Remove encryption keys from memory
            this.encryption.removeSessionEncryption(sessionId);

            // Remove from project manager
            projectManager.removeSession(sessionId);

            // Clear any cached git status
            gitStatusSync.clearForSession(sessionId);
            this.messagesSync.delete(sessionId);
            this.sendSync.delete(sessionId);
            this.olderMessagesSync.delete(sessionId);
            this.olderMessagesRetryGuard.clear(sessionId);
            this.outbox.deletePending(sessionId);
            this.sessionLastSeq.delete(sessionId);
            this.sessionFirstSeq.delete(sessionId);
            this.sessionHasMoreBefore.delete(sessionId);
            this.messageIngest.clearSession(sessionId);

            log.log(`🗑️ Session ${sessionId} deleted from local storage`);
        } else if (updateData.body.t === 'update-session') {
            const sessionId = updateData.body.id;
            const session = storage.getState().sessions[sessionId];
            if (session) {
                // Get session encryption
                const sessionEncryption = this.encryption.getSessionEncryption(sessionId);
                if (handleMissingSessionForUpdate({
                    sessionId,
                    updateType: 'update-session',
                    hasSession: true,
                    hasEncryption: Boolean(sessionEncryption),
                    fetchSessions: () => this.refreshMissingSession(sessionId),
                })) {
                    return;
                }
                if (!sessionEncryption) {
                    return;
                }

                const agentState = updateData.body.agentState && sessionEncryption
                    ? await sessionEncryption.decryptAgentState(updateData.body.agentState.version, updateData.body.agentState.value)
                    : session.agentState;
                const metadata = updateData.body.metadata && sessionEncryption
                    ? await sessionEncryption.decryptMetadata(updateData.body.metadata.version, updateData.body.metadata.value)
                    : session.metadata;
                this.accountLifecycle.assertCurrent(generation);

                this.applySessions([{
                    ...session,
                    agentState,
                    agentStateVersion: updateData.body.agentState
                        ? updateData.body.agentState.version
                        : session.agentStateVersion,
                    metadata,
                    metadataVersion: updateData.body.metadata
                        ? updateData.body.metadata.version
                        : session.metadataVersion,
                    updatedAt: updateData.createdAt,
                    seq: updateData.seq
                }]);

                // Invalidate git status when agent state changes (files may have been modified)
                if (updateData.body.agentState) {
                    gitStatusSync.invalidate(updateData.body.id);

                    // Re-fetch messages when control returns to mobile (local -> remote mode switch)
                    // This catches up on any messages that were exchanged while desktop had control
                    const wasControlledByUser = session.agentState?.controlledByUser;
                    const isNowControlledByUser = agentState?.controlledByUser;
                    if (shouldRefreshMessagesForControlHandoff({
                        previousControlledByUser: wasControlledByUser,
                        nextControlledByUser: isNowControlledByUser,
                    })) {
                        log.log(`🔄 Control returned to mobile for session ${updateData.body.id}, re-fetching messages`);
                        this.onSessionVisible(updateData.body.id);
                    }
                }
            }
        } else if (updateData.body.t === 'update-account') {
            const accountUpdate = updateData.body;
            const currentProfile = storage.getState().profile;

            // Build updated profile with new data
            const updatedProfile: Profile = {
                ...currentProfile,
                firstName: accountUpdate.firstName !== undefined ? accountUpdate.firstName : currentProfile.firstName,
                lastName: accountUpdate.lastName !== undefined ? accountUpdate.lastName : currentProfile.lastName,
                avatar: accountUpdate.avatar !== undefined ? accountUpdate.avatar : currentProfile.avatar,
                timestamp: updateData.createdAt // Update timestamp to latest
            };

            // Apply the updated profile to storage
            storage.getState().applyProfile(updatedProfile);

            // Handle settings updates (new for profile sync)
            if (accountUpdate.settings?.value) {
                try {
                    const decryptedSettings = await this.encryption.decryptRaw(accountUpdate.settings.value);
                    this.accountLifecycle.assertCurrent(generation);
                    const parsedSettings = settingsParse(decryptedSettings);

                    // Version compatibility check
                    const settingsSchemaVersion = parsedSettings.schemaVersion ?? 1;
                    if (settingsSchemaVersion > SUPPORTED_SCHEMA_VERSION) {
                        console.warn(
                            `⚠️ Received settings schema v${settingsSchemaVersion}, ` +
                            `we support v${SUPPORTED_SCHEMA_VERSION}. Update app for full functionality.`
                        );
                    }

                    this.applyServerSettings(parsedSettings, accountUpdate.settings.version);
                    log.log(`📋 Settings synced from server (schema v${settingsSchemaVersion}, version ${accountUpdate.settings.version})`);
                } catch (error) {
                    this.accountLifecycle.assertCurrent(generation);
                    console.error('❌ Failed to process settings update:', error);
                    // Don't crash on settings sync errors, just log
                }
            }
        } else if (updateData.body.t === 'update-machine') {
            const machineUpdate = updateData.body;
            const machineId = machineUpdate.machineId;  // Changed from .id to .machineId
            const machine = storage.getState().machines[machineId];

            // Create or update machine with all required fields
            const updatedMachine: Machine = {
                id: machineId,
                seq: updateData.seq,
                createdAt: machine?.createdAt ?? updateData.createdAt,
                updatedAt: updateData.createdAt,
                active: machineUpdate.active ?? true,
                activeAt: machineUpdate.activeAt ?? updateData.createdAt,
                metadata: machine?.metadata ?? null,
                metadataVersion: machine?.metadataVersion ?? 0,
                daemonState: machine?.daemonState ?? null,
                daemonStateVersion: machine?.daemonStateVersion ?? 0
            };

            // Get machine-specific encryption (might not exist if machine wasn't initialized)
            const machineEncryption = this.encryption.getMachineEncryption(machineId);
            if (!machineEncryption) {
                console.error(`Machine encryption not found for ${machineId} - cannot decrypt updates`);
                return;
            }

            // If metadata is provided, decrypt and update it
            const metadataUpdate = machineUpdate.metadata;
            if (metadataUpdate) {
                try {
                    const metadata = await machineEncryption.decryptMetadata(metadataUpdate.version, metadataUpdate.value);
                    this.accountLifecycle.assertCurrent(generation);
                    updatedMachine.metadata = metadata;
                    updatedMachine.metadataVersion = metadataUpdate.version;
                } catch (error) {
                    this.accountLifecycle.assertCurrent(generation);
                    console.error(`Failed to decrypt machine metadata for ${machineId}:`, error);
                }
            }

            // If daemonState is provided, decrypt and update it
            const daemonStateUpdate = machineUpdate.daemonState;
            if (daemonStateUpdate) {
                try {
                    const daemonState = await machineEncryption.decryptDaemonState(daemonStateUpdate.version, daemonStateUpdate.value);
                    this.accountLifecycle.assertCurrent(generation);
                    updatedMachine.daemonState = daemonState;
                    updatedMachine.daemonStateVersion = daemonStateUpdate.version;
                } catch (error) {
                    this.accountLifecycle.assertCurrent(generation);
                    console.error(`Failed to decrypt machine daemonState for ${machineId}:`, error);
                }
            }

            // Update storage using applyMachines which rebuilds sessionListViewData
            storage.getState().applyMachines([updatedMachine]);
        } else if (updateData.body.t === 'delete-machine') {
            const machineId = updateData.body.machineId;
            log.log(`🗑️ Delete machine update received for ${machineId}`);
            if (!storage.getState().machines[machineId]) {
                log.log(`Machine ${machineId} not in storage, skipping delete`);
            } else {
                storage.getState().deleteMachine(machineId);
                this.encryption.removeMachineEncryption(machineId);
                this.machineDataKeys.delete(machineId);
            }
        } else if (updateData.body.t === 'new-artifact') {
            log.log('📦 Received new-artifact update');
            const artifactUpdate = updateData.body;
            const artifactId = artifactUpdate.artifactId;
            
            try {
                // Decrypt the data encryption key
                const decryptedKey = await this.encryption.decryptEncryptionKey(artifactUpdate.dataEncryptionKey);
                this.accountLifecycle.assertCurrent(generation);
                if (!decryptedKey) {
                    console.error(`Failed to decrypt key for new artifact ${artifactId}`);
                    return;
                }
                
                // Store the decrypted key in memory
                this.artifactDataKeys.set(artifactId, decryptedKey);
                
                // Create artifact encryption instance
                const artifactEncryption = new ArtifactEncryption(decryptedKey);
                
                // Decrypt header
                const header = await artifactEncryption.decryptHeader(artifactUpdate.header);
                this.accountLifecycle.assertCurrent(generation);
                
                // Decrypt body if provided
                let decryptedBody: string | null | undefined = undefined;
                if (artifactUpdate.body && artifactUpdate.bodyVersion !== undefined) {
                    const body = await artifactEncryption.decryptBody(artifactUpdate.body);
                    this.accountLifecycle.assertCurrent(generation);
                    decryptedBody = body?.body || null;
                }
                
                // Add to storage
                const decryptedArtifact: DecryptedArtifact = {
                    id: artifactId,
                    title: header?.title || null,
                    body: decryptedBody,
                    headerVersion: artifactUpdate.headerVersion,
                    bodyVersion: artifactUpdate.bodyVersion,
                    seq: artifactUpdate.seq,
                    createdAt: artifactUpdate.createdAt,
                    updatedAt: artifactUpdate.updatedAt,
                    isDecrypted: !!header,
                };
                
                storage.getState().addArtifact(decryptedArtifact);
                log.log(`📦 Added new artifact ${artifactId} to storage`);
            } catch (error) {
                this.accountLifecycle.assertCurrent(generation);
                console.error(`Failed to process new artifact ${artifactId}:`, error);
            }
        } else if (updateData.body.t === 'update-artifact') {
            log.log('📦 Received update-artifact update');
            const artifactUpdate = updateData.body;
            const artifactId = artifactUpdate.artifactId;
            
            // Get existing artifact
            const existingArtifact = storage.getState().artifacts[artifactId];
            if (!existingArtifact) {
                console.error(`Artifact ${artifactId} not found in storage`);
                // Fetch all artifacts to sync
                this.artifactsSync.invalidate();
                return;
            }
            
            try {
                // Get the data encryption key from memory
                let dataEncryptionKey = this.artifactDataKeys.get(artifactId);
                if (!dataEncryptionKey) {
                    console.error(`Encryption key not found for artifact ${artifactId}, fetching artifacts`);
                    this.artifactsSync.invalidate();
                    return;
                }
                
                // Create artifact encryption instance
                const artifactEncryption = new ArtifactEncryption(dataEncryptionKey);
                
                // Update artifact with new data  
                const updatedArtifact: DecryptedArtifact = {
                    ...existingArtifact,
                    seq: updateData.seq,
                    updatedAt: updateData.createdAt,
                };
                
                // Decrypt and update header if provided
                if (artifactUpdate.header) {
                    const header = await artifactEncryption.decryptHeader(artifactUpdate.header.value);
                    this.accountLifecycle.assertCurrent(generation);
                    updatedArtifact.title = header?.title || null;
                    updatedArtifact.sessions = header?.sessions;
                    updatedArtifact.draft = header?.draft;
                    updatedArtifact.headerVersion = artifactUpdate.header.version;
                }
                
                // Decrypt and update body if provided
                if (artifactUpdate.body) {
                    const body = await artifactEncryption.decryptBody(artifactUpdate.body.value);
                    this.accountLifecycle.assertCurrent(generation);
                    updatedArtifact.body = body?.body || null;
                    updatedArtifact.bodyVersion = artifactUpdate.body.version;
                }
                
                storage.getState().updateArtifact(updatedArtifact);
                log.log(`📦 Updated artifact ${artifactId} in storage`);
            } catch (error) {
                this.accountLifecycle.assertCurrent(generation);
                console.error(`Failed to process artifact update ${artifactId}:`, error);
            }
        } else if (updateData.body.t === 'delete-artifact') {
            log.log('📦 Received delete-artifact update');
            const artifactUpdate = updateData.body;
            const artifactId = artifactUpdate.artifactId;
            
            // Remove from storage
            storage.getState().deleteArtifact(artifactId);
            
            // Remove encryption key from memory
            this.artifactDataKeys.delete(artifactId);
        }
    }

    private flushActivityUpdates = (updates: Map<string, ApiEphemeralActivityUpdate>) => {
        // log.log(`🔄 Flushing activity updates for ${updates.size} sessions - acquiring lock`);


        const sessions: Session[] = [];

        for (const [sessionId, update] of updates) {
            const session = storage.getState().sessions[sessionId];
            if (session) {
                const thinkingState = resolveActivityThinkingState(session, update);
                sessions.push({
                    ...session,
                    active: update.active,
                    activeAt: update.activeAt,
                    thinking: thinkingState.thinking,
                    thinkingAt: thinkingState.thinkingAt,
                });
            }
        }

        if (sessions.length > 0) {
            // console.log('flushing activity updates ' + sessions.length);
            this.applySessions(sessions);
            // log.log(`🔄 Activity updates flushed - updated ${sessions.length} sessions`);
        }
    }

    private handleEphemeralUpdate = (update: unknown, generation: number) => {
        if (!this.accountLifecycle.isCurrent(generation)) {
            return;
        }
        const validatedUpdate = ApiEphemeralUpdateSchema.safeParse(update);
        if (!validatedUpdate.success) {
            console.warn('Invalid ephemeral update received:', validatedUpdate.error);
            console.error('Invalid ephemeral update received:', update);
            return;
        } else {
            // console.log('Ephemeral update received:', update);
        }
        const updateData = validatedUpdate.data;

        // Process activity updates through smart debounce accumulator
        if (updateData.type === 'activity') {
            // console.log('adding activity update ' + updateData.id);
            this.activityAccumulator.addUpdate(updateData);
        }

        // Handle machine activity updates
        if (updateData.type === 'machine-activity') {
            // Update machine's active status and lastActiveAt
            const machine = storage.getState().machines[updateData.id];
            if (machine) {
                const updatedMachine: Machine = {
                    ...machine,
                    active: updateData.active,
                    activeAt: updateData.activeAt
                };
                storage.getState().applyMachines([updatedMachine]);
            }
        }

        if (updateData.type === 'usage') {
            storage.getState().applySessionUsage(
                updateData.id,
                buildLatestUsageFromEphemeral(updateData),
            );
        }

        // daemon-status ephemeral updates are deprecated, machine status is handled via machine-activity
    }

    //
    // Apply store
    //

    private applyMessages = (sessionId: string, messages: NormalizedMessage[]) => {
        storage.getState().applyMessages(sessionId, messages);
    }

    private applySessions = (sessions: (Omit<Session, "presence"> & {
        presence?: "online" | number;
    })[], replace = false) => {
        const active = storage.getState().getActiveSessions();
        storage.getState().applySessions(sessions, replace);
        const newActive = storage.getState().getActiveSessions();
    }

    private decryptSessions = async (sessions: ApiSessionRecord[], request: AccountRequest) => {
        request.assertCurrent();
        const encryption = this._encryption;
        if (!encryption) {
            throw new DOMException('Account lifecycle is stale', 'AbortError');
        }
        const sessionKeys = new Map<string, Uint8Array | null>();
        for (const session of sessions) {
            if (session.dataEncryptionKey) {
                const decrypted = await encryption.decryptEncryptionKey(session.dataEncryptionKey);
                request.assertCurrent();
                if (!decrypted) {
                    console.error(`Failed to decrypt data encryption key for session ${session.id}`);
                    continue;
                }
                sessionKeys.set(session.id, decrypted);
            } else {
                sessionKeys.set(session.id, null);
            }
        }
        await encryption.initializeSessions(sessionKeys);
        request.assertCurrent();

        const decryptedSessions: (Omit<Session, 'presence'> & { presence?: "online" | number })[] = [];
        for (const session of sessions) {
            const sessionEncryption = encryption.getSessionEncryption(session.id);
            if (!sessionEncryption) {
                console.error(`Session encryption not found for ${session.id} - this should never happen`);
                continue;
            }

            const metadata = await sessionEncryption.decryptMetadata(session.metadataVersion, session.metadata);
            const agentState = await sessionEncryption.decryptAgentState(session.agentStateVersion, session.agentState);
            request.assertCurrent();

            const existingSession = storage.getState().sessions[session.id];
            const thinkingState = resolveSessionThinkingState(existingSession, {
                active: session.active,
                activeAt: session.activeAt,
                thinking: session.thinking,
                thinkingAt: session.thinkingAt,
            });

            decryptedSessions.push({
                ...session,
                thinking: thinkingState.thinking,
                thinkingAt: thinkingState.thinkingAt,
                metadata,
                agentState,
            });
        }

        return decryptedSessions;
    }


}

// Global singleton instance
export const sync = new Sync();

//
// Init sequence
//

const initializationLifecycle = new AccountLifecycle();
const initializationGate = new RecoverableInitializationGate();

function runSyncInitialization(credentials: AuthCredentials, restore: boolean): Promise<void> {
    const initializationGeneration = initializationLifecycle.begin();
    return syncInit(credentials, restore, initializationGeneration).finally(() => {
        if (initializationLifecycle.isCurrent(initializationGeneration)) {
            initializationLifecycle.end();
        }
    });
}

export async function syncCreate(credentials: AuthCredentials) {
    await initializationGate.run(
        () => runSyncInitialization(credentials, false),
        () => sync.shutdown(),
    );
}

export async function syncRestore(credentials: AuthCredentials) {
    await initializationGate.run(
        () => runSyncInitialization(credentials, true),
        () => sync.shutdown(),
    );
}

export async function syncShutdown(): Promise<void> {
    initializationLifecycle.end();
    await initializationGate.reset(() => sync.shutdown());
}

export const syncResetAccount = syncShutdown;

async function syncInit(credentials: AuthCredentials, restore: boolean, initializationGeneration: number) {

    // Initialize sync engine
    const secretKey = decodeBase64(credentials.secret, 'base64url');
    if (secretKey.length !== 32) {
        throw new Error(`Invalid secret key length: ${secretKey.length}, expected 32`);
    }
    const encryption = await initializationLifecycle.runRequest(initializationGeneration, async () => {
        return await Encryption.create(secretKey);
    });
    initializationLifecycle.assertCurrent(initializationGeneration);

    // Initialize tracking
    initializeTracking(encryption.anonID);
    initializationLifecycle.assertCurrent(initializationGeneration);

    // Initialize socket connection
    const API_ENDPOINT = getServerUrl();
    apiSocket.initialize({ endpoint: API_ENDPOINT, token: credentials.token }, encryption);
    initializationLifecycle.assertCurrent(initializationGeneration);

    // Wire socket status to storage
    apiSocket.onStatusChange((status) => {
        storage.getState().setSocketStatus(status);
    });

    // Initialize sessions engine
    if (restore) {
        await sync.restore(credentials, encryption);
    } else {
        await sync.create(credentials, encryption);
    }
}
