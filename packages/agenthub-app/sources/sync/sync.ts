import Constants from 'expo-constants';
import { apiSocket, getAgentHubClientId } from '@/sync/apiSocket';
import { AuthCredentials } from '@/auth/tokenStorage';
import { Encryption } from '@/sync/encryption/encryption';
import { decodeBase64 } from '@/encryption/base64';
import { encryptBlob } from '@/encryption/blob';
import { storage } from './storage';
import { ApiMessage } from './apiTypes';
import type { ApiEphemeralActivityUpdate } from './apiTypes';
import { Session, Machine } from './storageTypes';
import { InvalidateSync } from '@/utils/sync';
import { ActivityUpdateAccumulator } from './reducer/activityUpdateAccumulator';
import { randomUUID } from 'expo-crypto';
import { getOrCreateDeviceId } from './deviceIdentity';
import { claimSessionControl, getSessionControl } from './sessionControlApi';
import { ensureSendControl } from './sendControlLifecycle';
import { buildUserMessageContent } from './sendMessageContent';
import { enqueueUploadedAttachments } from './sendAttachmentApplication';
import { enqueueTextMessage } from './sendTextMessageApplication';
import { resolveSentFrom } from './sendMessagePlatform';
import { completeSendMessage } from './sendMessageCompletion';
import { sessionControlStore } from './sessionControlStore';
import * as Notifications from 'expo-notifications';
import { syncCurrentPushToken } from './pushRegistration';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { isRunningOnMac } from '@/utils/platform';
import { NormalizedMessage, normalizeRawMessage } from './typesRaw';
import { Settings, settingsDefaults } from './settings';
import { Profile } from './profile';
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
import { fetchArtifact, createArtifact, updateArtifact } from './apiArtifacts';
import { DecryptedArtifact, Artifact } from './artifactTypes';
import { ArtifactEncryption } from './encryption/artifactEncryption';
import { resolveSendMessageContext } from './sendMessageContext';
import { MessageIngestService } from './messageIngestService';
import { OutboxService } from './outboxService';
import { AccountLifecycle, type AccountRequest } from './accountLifecycle';
import { RecoverableInitializationGate } from './initializationGate';
import { fileSearchCache } from './suggestionFile';
import { useFileTransferStore } from './fileTransferStore';
import { httpClient } from './authenticatedHttpClient';
import { createAbortScope } from './httpClient';
import { PaginationRetryGuard } from './paginationRetryGuard';
import { classifySessionMessageLoadError } from './sessionMessageLoadState';
import { requestAttachmentUpload, uploadEncryptedAttachment } from './apiAttachments';
import { uploadImageAttachments } from './sendAttachmentUploadApplication';
import { DataKeyRegistry } from './dataKeyRegistry';
import { areArtifactSessionsEqual } from './artifactSessions';
import { MessagePaginationState } from './messagePaginationState';
import { runActivityFlushLifecycle } from './activityFlushLifecycle';
import { cleanupDeletedSession } from './sessionDeleteCleanup';
import { runSessionMessageFetch } from './sessionMessageFetchLifecycle';
import { dispatchEphemeralRealtimeUpdate } from './ephemeralRealtimeDispatch';
import { runRealtimeUpdateLifecycle } from './realtimeUpdateLifecycle';
import { ensureSessionLoadedApplication } from './ensureSessionLoadedApplication';
import { processMessagePage } from './messagePageApplication';
import { runMessagePageLifecycle } from './messagePageLifecycle';
import { buildLifecycleThinkingSessionUpdate } from './lifecycleThinkingProjection';
import { decryptSessionSnapshot, type SessionSnapshotRecord } from './sessionSnapshotApplication';
import { loadSessionSnapshot } from './sessionSnapshotLoadLifecycle';
import { type MachineSnapshotRecord } from './machineSnapshotApplication';
import { runSessionOlderMessagesFetch } from './sessionOlderMessagesFetchLifecycle';
import {
    runArtifactBodyFetch,
    runArtifactCreate,
    runArtifactUpdate,
} from './artifactCrudLifecycle';
import { applyArtifactBodyFetch } from './artifactBodyFetchApplication';
import { applyArtifactCreate } from './artifactCreateApplication';
import { applyArtifactUpdateRequest } from './artifactUpdateRequestApplication';
import { decodeAccountSettingsSnapshot } from './accountSettingsSnapshot';
import { applyServerSettings as applyServerSettingsSnapshot } from './serverSettingsApplication';
import { applyLocalSettingsUpdate } from './settingsLocalUpdateLifecycle';
import { fetchNativeUpdateStatus } from './nativeUpdateRequestApplication';
import { notifyUnreadMessage } from './webTabTitle';
import { runReconnectSyncApplication } from './reconnectSyncApplication';
import { runProfileSync } from './profileSyncLifecycle';
import { runPushTokenSync } from './pushTokenSyncLifecycle';
import { runNativeUpdateSync } from './nativeUpdateSyncLifecycle';
import { scheduleMissingSessionRefresh } from './missingSessionRefreshApplication';
import { applyPendingOutboxFailure } from './outboxFailureApplication';
import { runSyncInitializationApplication } from './syncInitializationApplication';
import { BackgroundSendWatchdog } from './backgroundSendWatchdog';
import { retrySessionMessages, runSessionVisibility } from './sessionVisibilityLifecycle';
import { applyAppStateChange } from './appStateLifecycle';
import { subscribeAppStateListener } from './appStateSubscriptionLifecycle';
import { prepareSendMessage } from './sendMessagePreparation';
import { dispatchSendMessage } from './sendMessageDispatch';
import { createAccountSyncs, initializeAccountSyncs } from './syncStartupLifecycle';
import { stopAccountSyncs } from './syncAccountLifecycle';
import { shutdownAccount } from './syncShutdownLifecycle';
import { runArtifactListSync } from './artifactListSyncLifecycle';
import { bindSyncRealtimeEvents } from './syncRealtimeSubscriptionLifecycle';
import { runSessionSnapshotSync } from './sessionSnapshotSyncLifecycle';
import { runMachineSnapshotSync } from './machineSnapshotSyncLifecycle';
import { runSettingsSyncLifecycle } from './settingsSyncLifecycle';
import { runSessionOutboxLifecycle } from './sessionOutboxLifecycle';
import { runSendMessageLifecycle } from './sendMessageLifecycle';
import { createSyncRealtimeUpdateContexts } from './syncRealtimeUpdateContext';
import { createSyncEphemeralUpdateContext } from './syncEphemeralUpdateContext';
import { createArtifactOperations } from './artifactOperations';

type V3GetSessionMessagesResponse = {
    messages: ApiMessage[];
    hasMore: boolean;
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

export type SendMessageResult = {
    sent: boolean;
    failedAttachments: number;
    controlDenied?: boolean;
};

type ApiSessionRecord = SessionSnapshotRecord;

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
    private readonly messagePagination = new MessagePaginationState();
    private olderMessagesSync = new Map<string, InvalidateSync>();
    private olderMessagesRetryGuard = new PaginationRetryGuard();
    private outbox = new OutboxService();
    private messageIngest = new MessageIngestService((sessionId, messages) => this.applyMessages(sessionId, messages));
    private missingSessionRefreshes = new Set<string>();
    private readonly dataKeys = new DataKeyRegistry();
    private settingsSync!: InvalidateSync;
    private profileSync!: InvalidateSync;
    private machinesSync!: InvalidateSync;
    private pushTokenSync!: InvalidateSync;
    private nativeUpdateSync!: InvalidateSync;
    private artifactsSync!: InvalidateSync;
    private activityAccumulator: ActivityUpdateAccumulator;
    private pendingSettings: Partial<Settings> = loadPendingSettings();
    private appState: AppStateStatus = AppState.currentState;
    private readonly backgroundSendWatchdog: BackgroundSendWatchdog;
    private cancelStartupSyncs: (() => void) | null = null;
    private cancelRealtimeSubscriptions: (() => void) | null = null;
    private removeAppStateListener: (() => void) | null = null;
    private readonly accountLifecycle = new AccountLifecycle();
    private readonly artifactOperations;

    constructor() {
        this.artifactOperations = createArtifactOperations({
            getCredentials: () => this.credentials,
            getEncryption: () => this._encryption,
            requireGeneration: () => this.requireAccountGeneration(),
            accountLifecycle: this.accountLifecycle,
            dataKeys: this.dataKeys,
            scheduleListRetry: () => this.artifactsSync.invalidate(),
        });
        this.createAccountSyncs(0);
        this.activityAccumulator = new ActivityUpdateAccumulator(this.flushActivityUpdates.bind(this), 2000);
        this.backgroundSendWatchdog = new BackgroundSendWatchdog({
            timeoutMs: Sync.BACKGROUND_SEND_TIMEOUT_MS,
            now: () => Date.now(),
            setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
            clearTimeout: (handle) => clearTimeout(handle),
            hasPending: () => this.hasPendingOutboxMessages(),
            scheduleNotification: () => Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Message not sent',
                    body: 'A message is still sending in the background. It will fail in 30 seconds if not delivered.',
                    sound: true,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: Math.ceil(Sync.BACKGROUND_SEND_TIMEOUT_MS / 1000),
                },
            }),
            cancelNotification: (notificationId) => Notifications.cancelScheduledNotificationAsync(notificationId),
            notifyFailure: () => this.notifyMessageSendFailed(),
            failPending: (reason) => this.failPendingOutboxMessages(reason),
            log: (message) => log.log(message),
        });

        this.registerAppStateListener();
    }

    private registerAppStateListener() {
        if (this.removeAppStateListener) return;
        this.removeAppStateListener = subscribeAppStateListener(
            (event, listener) => AppState.addEventListener(event, listener),
            (nextAppState) => this.handleAppStateChange(nextAppState),
        );
    }

    private handleAppStateChange(nextAppState: AppStateStatus) {
        applyAppStateChange({
            nextAppState,
            setAppState: (state) => {
                this.appState = state;
                apiSocket.setAppState(state);
            },
            isAccountActive: () => this.accountLifecycle.isActive(),
            onActive: () => {
                void this.backgroundSendWatchdog.handleAppActive(() => this.hasPendingOutboxMessages());
                log.log('📱 App became active');
                this.profileSync.invalidate();
                this.machinesSync.invalidate();
                this.pushTokenSync.invalidate();
                this.sessionsSync.invalidate();
                this.nativeUpdateSync.invalidate();
                log.log('📱 App became active: Invalidating artifacts sync');
                this.artifactsSync.invalidate();
            },
            onBackground: (state) => {
                log.log(`📱 App state changed to: ${state}`);
                this.backgroundSendWatchdog.maybeStart({
                    isWeb: Platform.OS === 'web',
                    isActive: false,
                    hasPending: this.hasPendingOutboxMessages(),
                });
            },
        });
    }

    get encryption(): Encryption {
        if (!this._encryption) {
            throw new Error('Sync encryption is not initialized. Please sign in again and retry.');
        }
        return this._encryption;
    }

    private createAccountSyncs(generation: number) {
        const syncs = createAccountSyncs({
            generation,
            createSync: (run) => new InvalidateSync(run),
            fetchSessions: (syncGeneration) => this.fetchSessions(syncGeneration),
            syncSettings: (syncGeneration) => this.syncSettings(syncGeneration),
            fetchProfile: (syncGeneration) => this.fetchProfile(syncGeneration),
            fetchMachines: (syncGeneration) => this.fetchMachines(syncGeneration),
            fetchNativeUpdate: (syncGeneration) => this.fetchNativeUpdate(syncGeneration),
            fetchArtifactsList: (syncGeneration) => this.fetchArtifactsList(syncGeneration),
            registerPushToken: (syncGeneration) => this.registerPushToken(syncGeneration),
            isDev: __DEV__,
            hasCredentials: () => Boolean(this.credentials),
        });
        this.sessionsSync = syncs.sessionsSync;
        this.settingsSync = syncs.settingsSync;
        this.profileSync = syncs.profileSync;
        this.machinesSync = syncs.machinesSync;
        this.nativeUpdateSync = syncs.nativeUpdateSync;
        this.artifactsSync = syncs.artifactsSync;
        this.pushTokenSync = syncs.pushTokenSync;
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
        this.registerAppStateListener();
        this.stopAccountSyncs();
        // Account replacement must invalidate any background-send timeout
        // before the new generation can create or observe outbox work.
        void this.backgroundSendWatchdog.stop();
        this.olderMessagesRetryGuard.clearAll();
        const generation = this.accountLifecycle.begin();
        this.createAccountSyncs(generation);
        return generation;
    }

    private stopAccountSyncs() {
        // Activity updates are debounced outside the keyed sync maps. Clear the
        // accumulator before switching/ending an account so an old timer cannot
        // project stale session activity into the next account.
        this.activityAccumulator.reset();
        stopAccountSyncs({
            cancelRealtimeSubscriptions: this.cancelRealtimeSubscriptions,
            clearRealtimeSubscriptions: () => {
                this.cancelRealtimeSubscriptions = null;
            },
            accountSyncs: [
                this.sessionsSync,
                this.settingsSync,
                this.profileSync,
                this.machinesSync,
                this.pushTokenSync,
                this.nativeUpdateSync,
                this.artifactsSync,
            ],
            keyedSyncs: [
                ...this.messagesSync.values(),
                ...this.sendSync.values(),
                ...this.olderMessagesSync.values(),
            ],
        });
    }

    async shutdown(): Promise<void> {
        await shutdownAccount({
            endAccount: () => this.accountLifecycle.end(),
            removeAppStateListener: () => {
                this.removeAppStateListener?.();
                this.removeAppStateListener = null;
            },
            cancelStartupSyncs: this.cancelStartupSyncs,
            clearStartupSyncs: () => {
                this.cancelStartupSyncs = null;
            },
            stopAccountSyncs: () => this.stopAccountSyncs(),
            stopBackgroundWatchdog: () => this.backgroundSendWatchdog.stop(),
            failOutbox: () => this.outbox.failAll(),
            clearMessageIngest: () => this.messageIngest.clearAll(),
            resetActivityAccumulator: () => this.activityAccumulator.reset(),
            clearSyncMaps: () => {
                this.messagesSync.clear();
                this.sendSync.clear();
                this.olderMessagesSync.clear();
            },
            clearRetryGuards: () => this.olderMessagesRetryGuard.clearAll(),
            clearPagination: () => this.messagePagination.clearAll(),
            clearMissingSessionRefreshes: () => this.missingSessionRefreshes.clear(),
            clearDataKeys: () => this.dataKeys.clear(),
            clearEncryptionCache: () => this.encryptionCache.clearAll(),
            resetPendingSettings: () => {
                this.pendingSettings = {};
                savePendingSettings({});
            },
            resetGitStatus: () => gitStatusSync.resetAll(),
            clearProjectManager: () => projectManager.clear(),
            clearFileSearchCache: () => fileSearchCache.clearCache(),
            resetFileTransfers: () => useFileTransferStore.getState().resetAccountTasks(),
            resetSocket: () => apiSocket.reset(),
            resetStorage: () => storage.getState().resetAccountState(),
            clearCredentials: () => {
                this.credentials = null;
                this._encryption = null;
                this.serverID = '';
                this.anonID = '';
            },
        });
    }

    async #init(options: { deferBackgroundSyncs: boolean; generation: number }) {
        this.cancelStartupSyncs = initializeAccountSyncs({
            generation: options.generation,
            deferBackgroundSyncs: options.deferBackgroundSyncs,
            syncs: {
                sessionsSync: this.sessionsSync,
                settingsSync: this.settingsSync,
                profileSync: this.profileSync,
                machinesSync: this.machinesSync,
                nativeUpdateSync: this.nativeUpdateSync,
                artifactsSync: this.artifactsSync,
                pushTokenSync: this.pushTokenSync,
            },
            subscribeToUpdates: (generation) => this.subscribeToUpdates(generation),
            runIfCurrent: (generation, effect) => this.accountLifecycle.runIfCurrent(generation, effect),
            applyReady: () => storage.getState().applyReady(),
            previousCancel: this.cancelStartupSyncs,
            onBackgroundTaskError: (name, error) => {
                console.warn(`Failed to schedule startup sync ${name}:`, error);
            },
            onSessionLoadError: (error) => {
                console.error('Failed to load sessions:', error);
            },
        });
    }


    onSessionVisible = (sessionId: string) => {
        const generation = this.requireAccountGeneration();
        runSessionVisibility({
            sessionId,
            clearMessageError: (id) => storage.getState().applyMessagesLoadError(id, null),
            invalidateMessages: (id) => this.getMessagesSync(id).invalidate(),
            invalidateGitStatus: (id) => gitStatusSync.getSync(id).invalidate(),
            loadSessionControl: getSessionControl,
            applySessionControl: (response) => sessionControlStore.getState().apply(response),
            isCurrent: () => this.accountLifecycle.isCurrent(generation),
            warn: (message, error) => console.warn(message, error),
        });
    }

    retryMessages = (sessionId: string) => {
        retrySessionMessages({
            sessionId,
            clearMessageError: (id) => storage.getState().applyMessagesLoadError(id, null),
            invalidateMessages: (id) => this.getMessagesSync(id).invalidate(),
        });
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
        if (!this.messagePagination.getHasMoreBefore(sessionId)) {
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
            throw new Error('Sync account is not active. Please sign in again and retry.');
        }
        return generation;
    }

    private hasPendingOutboxMessages() {
        return this.outbox.hasPending();
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
        applyPendingOutboxFailure({
            failAll: () => this.outbox.failAll(),
            enqueueMessages: (sessionId, messages) => this.enqueueMessages(sessionId, messages),
            now: Date.now(),
            reasonText,
            createMessageId: randomUUID,
        });
    }

    async sendMessage(sessionId: string, text: string, options?: SendMessageOptions): Promise<SendMessageResult> {
        const generation = this.requireAccountGeneration();
        const isCurrent = () => this.accountLifecycle.isCurrent(generation);
        const initialFailureCount = options?.images?.length ?? 0;
        return runSendMessageLifecycle({
            isCurrent,
            prepare: async () => {
                const preparation = await prepareSendMessage({
                    initialControl: sessionControlStore.getState().get(sessionId),
                    ensureControl: (initial) => ensureSendControl({
                        initial,
                        getCurrent: () => sessionControlStore.getState().get(sessionId),
                        getRemoteState: () => getSessionControl(sessionId),
                        claimRemote: () => claimSessionControl(sessionId),
                        apply: (state) => sessionControlStore.getState().apply(state),
                        isCurrent,
                    }),
                    getEncryption: () => this.encryption.getSessionEncryption(sessionId),
                    getSession: () => storage.getState().sessions[sessionId],
                    initialFailureCount,
                    onControlError: (error) => console.warn('Failed to establish session control before sending:', error),
                    isCurrent,
                });
                if (preparation.kind === 'control-denied') {
                    return { kind: 'failed' as const, result: { sent: false, failedAttachments: 0, controlDenied: true } };
                }
                if (preparation.kind === 'missing-encryption') {
                    console.error(`Session ${sessionId} not found`);
                    return { kind: 'failed' as const, result: { sent: false, failedAttachments: preparation.failedAttachments } };
                }
                if (preparation.kind === 'missing-session') {
                    console.error(`Session ${sessionId} not found in storage`);
                    return { kind: 'failed' as const, result: { sent: false, failedAttachments: preparation.failedAttachments } };
                }
                return { kind: 'ready' as const, value: preparation };
            },
            dispatch: async ({ encryption, session }) => {
                const {
                    permissionMode,
                    model,
                    effort,
                    displayText,
                    fileReferences,
                    images,
                    source,
                } = resolveSendMessageContext({ session, options });

                const sentFrom = resolveSentFrom(Platform.OS, Platform.OS === 'ios' && isRunningOnMac());
                return dispatchSendMessage({
                    text,
                    images,
                    context: {
                        displayText,
                        fileReferences,
                        sentFrom,
                        permissionMode,
                        model,
                        effort,
                        source,
                        metadata: session.metadata,
                    },
                    uploadAttachments: async (imageInputs) => uploadImageAttachments({
                        sessionId,
                        images: imageInputs,
                        credentials: this.credentials,
                        blobKey: this.encryption.getSessionBlobKey(sessionId),
                        decodeBase64,
                        encryptBlob,
                        requestUpload: requestAttachmentUpload,
                        uploadEncrypted: uploadEncryptedAttachment,
                        logFailure: (message) => {
                            if (message.startsWith('Upload unavailable for session')) {
                                log.log(`[attachments] ${message}`);
                            } else {
                                log.log(`[attachments] Image upload failed (${message})`);
                            }
                        },
                        isCurrent,
                    }),
                    enqueueAttachments: (attachments) => enqueueUploadedAttachments({
                        sessionId,
                        attachments,
                        createId: randomUUID,
                        now: Date.now,
                        encryptRawRecord: (record) => encryption.encryptRawRecord(record),
                        normalizeRawMessage,
                        enqueueMessages: (targetSessionId, messages) => this.enqueueMessages(targetSessionId, messages),
                        enqueueOutbox: (targetSessionId, message) => this.outbox.enqueue(targetSessionId, message),
                        isCurrent,
                    }),
                    buildContent: (context) => buildUserMessageContent({
                        text,
                        displayText: context.displayText,
                        fileReferences: context.fileReferences,
                        sentFrom: context.sentFrom,
                        turnOriginDevice: getOrCreateDeviceId(),
                        permissionMode: context.permissionMode,
                        model: context.model,
                        effort: context.effort,
                        appendSystemPrompt: systemPrompt,
                    }),
                    enqueueText: (content) => enqueueTextMessage({
                        sessionId,
                        content,
                        createId: randomUUID,
                        now: Date.now,
                        encryptRawRecord: (record) => encryption.encryptRawRecord(record),
                        normalizeRawMessage,
                        enqueueMessages: (targetSessionId, messages) => this.enqueueMessages(targetSessionId, messages),
                        enqueueOutbox: (targetSessionId, message) => this.outbox.enqueue(targetSessionId, message),
                        isCurrent,
                    }).then(() => undefined),
                    complete: () => completeSendMessage({
                        source,
                        metadata: session.metadata,
                        track: trackMessageSent,
                        invalidate: () => this.getSendSync(sessionId).invalidate(),
                        startWatchdog: () => this.backgroundSendWatchdog.maybeStart({
                            isWeb: Platform.OS === 'web',
                            isActive: this.appState === 'active',
                            hasPending: this.hasPendingOutboxMessages(),
                        }),
                    }),
                    isCurrent,
                });
            },
        });
    }

    /** Server sent us settings — merge any pending local changes on top, then apply as one update. */
    private applyServerSettings = (serverSettings: Settings, version: number) => {
        applyServerSettingsSnapshot({
            serverSettings,
            version,
            pendingSettings: this.pendingSettings,
            apply: (settings, settingsVersion) => storage.getState().applySettings(settings, settingsVersion),
        });
    }

    applySettings = (delta: Partial<Settings>) => {
        this.pendingSettings = applyLocalSettingsUpdate({
            delta,
            pendingSettings: this.pendingSettings,
            applyLocal: (settings) => storage.getState().applySettingsLocal(settings),
            save: savePendingSettings,
            invalidate: () => this.settingsSync.invalidate(),
        });
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

        await runSessionSnapshotSync({
            generation,
            assertCurrent: () => this.accountLifecycle.assertCurrent(generation),
            existingSessions: storage.getState().sessions,
            existingSessionIdsAtStart,
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
            fetchPage: async (cursor, signal) => {
                const queryPath: string = cursor ? `?limit=200&cursor=${encodeURIComponent(cursor)}` : '?limit=200';
                const response: { status: number; data: { sessions: ApiSessionRecord[]; nextCursor: string | null; hasNext: boolean } } = await httpClient.request(
                    credentials,
                    `/v2/sessions${queryPath}`,
                    { signal },
                );
                return {
                    items: response.data.sessions,
                    nextCursor: response.data.nextCursor,
                    hasNext: response.data.hasNext,
                };
            },
            encryption: this.encryption,
            applySessions: (sessions, persist) => this.applySessions(sessions, persist),
            scheduleRetry: () => this.sessionsSync.invalidate(),
            onIgnoredEmptySnapshot: () => console.warn(
                'Ignored an unexpected empty session snapshot; keeping the last known session list',
            ),
            log: (message) => log.log(message),
        });

    }

    private refreshMissingSession = (sessionId: string) => {
        const generation = this.requireAccountGeneration();
        const refreshKey = this.accountLifecycle.scopedKey(generation, sessionId);
        scheduleMissingSessionRefresh({
            key: refreshKey,
            isInFlight: (key) => this.missingSessionRefreshes.has(key),
            markInFlight: (key) => this.missingSessionRefreshes.add(key),
            clearInFlight: (key) => this.missingSessionRefreshes.delete(key),
            refresh: () => this.fetchSessions(generation),
            isCurrent: () => this.accountLifecycle.isCurrent(generation),
            onCurrentError: (error) => {
                log.log(`Failed to refresh missing session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
                this.sessionsSync.invalidate();
            },
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

        return ensureSessionLoadedApplication({
            existing,
            load: () => loadSessionSnapshot<ApiSessionRecord, Omit<Session, 'presence'> & { presence?: Session['presence'] }>({
                runRequest: (operation) => this.accountLifecycle.runRequest(generation, operation),
                fetch: (signal) => httpClient.request<{ session?: ApiSessionRecord } | { missing?: boolean }>(credentials, `/v1/sessions/${sessionId}`, {
                    signal,
                    acceptedStatuses: [404],
                }),
                decrypt: async (session, request) => {
                    const [result] = await decryptSessionSnapshot({
                        sessions: [session],
                        existingSessions: storage.getState().sessions,
                        encryption: this.encryption,
                        request,
                    });
                    return result ?? null;
                },
            }),
            apply: (decrypted) => {
                this.accountLifecycle.assertCurrent(generation);
                this.applySessions([decrypted]);
                return storage.getState().sessions[sessionId] ?? null;
            },
        });
    }

    public getCredentials() {
        return this.credentials;
    }

    /** Return the account generation for binding UI-triggered async work to one account lifecycle. */
    public getAccountGeneration(): number | null {
        return this.accountLifecycle.currentGeneration();
    }
    public fetchArtifactsList = async (generation = this.requireAccountGeneration()): Promise<void> =>
        this.artifactOperations.fetchList(generation);

    public fetchArtifactWithBody(artifactId: string): Promise<DecryptedArtifact> {
        return this.artifactOperations.fetchBody(artifactId);
    }

    public createArtifact(title: string | null, body: string | null, sessions?: string[], draft?: boolean): Promise<string> {
        return this.artifactOperations.create(title, body, sessions, draft);
    }

    public updateArtifact(artifactId: string, title: string | null, body: string | null, sessions?: string[], draft?: boolean): Promise<void> {
        return this.artifactOperations.update(artifactId, title, body, sessions, draft);
    }

    private fetchMachines = async (generation: number) => {
        const credentials = this.credentials;
        const encryption = this._encryption;
        if (!credentials || !encryption) return;
        const existingMachineIdsAtStart = Object.keys(storage.getState().machines);

        await runMachineSnapshotSync({
            generation,
            assertCurrent: () => this.accountLifecycle.assertCurrent(generation),
            existingMachines: storage.getState().machines,
            existingMachineIdsAtStart,
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
            fetchMachines: async (signal) => (await httpClient.request<MachineSnapshotRecord[]>(credentials, '/v1/machines', { signal })).data,
            encryption,
            setDataKey: (machineId, key) => this.dataKeys.set('machine', machineId, key),
            applyMachines: (machines, persist) => storage.getState().applyMachines(machines, persist),
            scheduleRetry: () => this.machinesSync.invalidate(),
            onIgnoredEmptySnapshot: () => console.warn(
                'Ignored an unexpected empty machine snapshot; keeping the last known machine list',
            ),
            log: (message) => log.log(message),
        });
    }

    private syncSettings = async (generation: number) => {
        const credentials = this.credentials;
        const encryption = this._encryption;
        if (!credentials || !encryption) return;

        await runSettingsSyncLifecycle({
            generation,
            pendingSettings: this.pendingSettings,
            currentSettings: storage.getState().settings,
            currentVersion: storage.getState().settingsVersion ?? 0,
            getPendingSettings: () => this.pendingSettings,
            setPendingSettings: (settings) => {
                this.pendingSettings = settings;
            },
            encryptSettings: (settings) => encryption.encryptRaw(settings),
            postSettings: async (encryptedSettings, expectedVersion, request) => {
                const response = await httpClient.request<{
                    success: false;
                    error: string;
                    currentVersion: number;
                    currentSettings: string | null;
                } | { success: true }>(credentials, '/v1/account/settings', {
                    method: 'POST',
                    signal: request.signal,
                    body: { settings: encryptedSettings, expectedVersion },
                });
                return response.data;
            },
            fetchSettings: async (request) => {
                const response = await httpClient.request<{
                    settings: string | null;
                    settingsVersion: number;
                }>(credentials, '/v1/account/settings', {
                    signal: request.signal,
                });
                return response.data;
            },
            decodeServerSettings: async (value, version) => decodeAccountSettingsSnapshot({
                value,
                version,
                defaults: settingsDefaults,
                decrypt: (encryptedValue) => encryption.decryptRaw(encryptedValue),
            }),
            applyServerSettings: this.applyServerSettings,
            savePendingSettings,
            assertCurrent: () => this.accountLifecycle.assertCurrent(generation),
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
        });
    }

    private fetchProfile = async (generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;

        await runProfileSync({
            generation,
            credentials,
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
            fetchProfile: async (profileCredentials, signal) => (await httpClient.request(profileCredentials, '/v1/account/profile', { signal })).data,
            assertCurrent: () => this.accountLifecycle.assertCurrent(generation),
            applyProfile: (profile) => storage.getState().applyProfile(profile),
        });
    }

    private fetchNativeUpdate = async (generation: number) => {
        const platform = Platform.OS;
        const version = Constants.expoConfig?.version;
        const appId = platform === 'ios'
            ? Constants.expoConfig?.ios?.bundleIdentifier
            : Constants.expoConfig?.android?.package;

        await runNativeUpdateSync({
            generation,
            platform,
            version,
            appId,
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
            fetchUpdate: (request) => fetchNativeUpdateStatus({
                request,
                serverUrl: getServerUrl(),
                platform: platform as 'android' | 'ios',
                version: version!,
                appId: appId!,
                clientId: getAgentHubClientId(),
            }),
            assertCurrent: () => this.accountLifecycle.assertCurrent(generation),
            isCurrent: () => this.accountLifecycle.isCurrent(generation),
            applyStatus: (status) => storage.getState().applyNativeUpdateStatus(status),
            reportError: (error) => console.warn('[fetchNativeUpdate] Error:', error),
        });
    }

    private flushOutbox = async (sessionId: string, generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;
        const pending = this.outbox.getPending(sessionId);
        await runSessionOutboxLifecycle({
            generation,
            pending,
            hasPending: () => this.hasPendingOutboxMessages(),
            startSend: () => this.outbox.startSend(sessionId),
            finishSend: (controller) => this.outbox.finishSend(sessionId, controller),
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
            postMessages: async (messages, signal) => {
                const response = await httpClient.request<{ messages: Array<{ seq: number }> }>(credentials, `/v3/sessions/${sessionId}/messages`, {
                    method: 'POST',
                    body: {
                        messages: messages.map((message) => ({
                            localId: message.localId,
                            content: message.content,
                        })),
                    },
                    signal,
                });
                return response.data;
            },
            assertCurrent: () => this.accountLifecycle.assertCurrent(generation),
            currentLastSeq: () => this.messagePagination.getLastSeq(sessionId) ?? 0,
            setLastSeq: (seq) => this.messagePagination.setLastSeq(sessionId, seq),
            deletePending: () => this.outbox.deletePending(sessionId),
            onIdle: async () => {
                await this.backgroundSendWatchdog.stop();
            },
            isCurrent: () => this.accountLifecycle.isCurrent(generation),
            onCurrentError: () => this.backgroundSendWatchdog.maybeStart({
                isWeb: Platform.OS === 'web',
                isActive: this.appState === 'active',
                hasPending: this.hasPendingOutboxMessages(),
            }),
            isBackground: () => this.appState !== 'active',
            onBackgroundPending: () => this.backgroundSendWatchdog.maybeStart({
                isWeb: Platform.OS === 'web',
                isActive: this.appState === 'active',
                hasPending: this.hasPendingOutboxMessages(),
            }),
        });
    }

    private fetchMessages = async (sessionId: string, generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;
        log.log(`💬 fetchMessages starting for session ${sessionId} - acquiring lock`);
        await runSessionMessageFetch({
            generation,
            sessionId,
            credentials,
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
            runInLock: (operation) => this.messageIngest.lock(sessionId).inLock(operation),
            getSessionEncryption: () => this.encryption.getSessionEncryption(sessionId),
            getLastSeq: () => this.messagePagination.getLastSeq(sessionId) ?? 0,
            hasLocalMessages: () => !!storage.getState().sessionMessages[sessionId]?.messages.length,
            fetchPage: async (path, pageRequest, pageCredentials) => {
                const data = (await httpClient.request<V3GetSessionMessagesResponse>(pageCredentials, path, { signal: pageRequest.signal })).data;
                return {
                    messages: Array.isArray(data.messages) ? data.messages : [],
                    hasMore: !!data.hasMore,
                };
            },
            processPage: (messages, pageRequest) => runMessagePageLifecycle({
                sessionId,
                messages,
                request: pageRequest,
                accountEncryption: this._encryption,
                processPage: processMessagePage,
            }),
            currentFirstSeq: () => this.messagePagination.getFirstSeq(sessionId),
            currentLastSeq: () => this.messagePagination.getLastSeq(sessionId),
            applyMessages: (messages) => this.applyMessages(sessionId, messages),
            setFirstSeq: (seq) => this.messagePagination.setFirstSeq(sessionId, seq),
            setLastSeq: (seq) => this.messagePagination.setLastSeq(sessionId, seq),
            setHasMoreBefore: (hasMoreBefore) => this.messagePagination.setHasMoreBefore(sessionId, hasMoreBefore),
            recordSuccess: () => this.olderMessagesRetryGuard.recordSuccess(sessionId),
            applyHistoryState: (state) => storage.getState().applyMessageHistoryState(sessionId, state),
            applyLifecycleThinkingState: (state) => this.applyLifecycleThinkingState(sessionId, state),
            markLoaded: () => storage.getState().applyMessagesLoaded(sessionId),
            classifyError: classifySessionMessageLoadError,
            isCurrent: () => this.accountLifecycle.isCurrent(generation),
            applyLoadError: (loadError) => storage.getState().applyMessagesLoadError(sessionId, loadError),
            onMissingEncryption: (message) => log.log(`💬 fetchMessages: ${message}, will retry`),
            onCompleted: (mode, processedCount) => log.log(`💬 fetchMessages completed ${mode} page for session ${sessionId} - processed ${processedCount} messages`),
            logStalled: () => log.log(`💬 fetchMessages: pagination stalled or regressed for ${sessionId}, stopping to avoid infinite loop`),
        });
    }

    private fetchOlderMessages = async (sessionId: string, generation: number) => {
        const credentials = this.credentials;
        if (!credentials) return;
        const beforeSeq = this.messagePagination.getFirstSeq(sessionId);
        if (!beforeSeq || !this.messagePagination.getHasMoreBefore(sessionId)) {
            return;
        }

        log.log(`💬 fetchOlderMessages starting for session ${sessionId} before seq ${beforeSeq}`);

        const processedCount = await runSessionOlderMessagesFetch({
            generation,
            sessionId,
            beforeSeq,
            credentials,
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
            runInLock: (operation) => this.messageIngest.lock(sessionId).inLock(operation),
            fetchPage: async (path, signal, pageCredentials) => {
                const data = (await httpClient.request<V3GetSessionMessagesResponse>(pageCredentials, path, { signal })).data;
                return {
                    messages: Array.isArray(data.messages) ? data.messages : [],
                    hasMore: !!data.hasMore,
                };
            },
            processPage: (messages, request) => runMessagePageLifecycle({
                sessionId,
                messages,
                request,
                accountEncryption: this._encryption,
                processPage: processMessagePage,
            }),
            currentFirstSeq: () => this.messagePagination.getFirstSeq(sessionId),
            currentLastSeq: () => this.messagePagination.getLastSeq(sessionId),
            applyMessages: (messages) => this.applyMessages(sessionId, messages),
            applyPageState: (pageState) => {
                if (pageState.firstSeq !== undefined) {
                    this.messagePagination.setFirstSeq(sessionId, pageState.firstSeq);
                }
                if (pageState.lastSeq !== undefined) {
                    this.messagePagination.setLastSeq(sessionId, pageState.lastSeq);
                }
                this.messagePagination.setHasMoreBefore(sessionId, pageState.hasMoreBefore);
            },
            recordSuccess: () => this.olderMessagesRetryGuard.recordSuccess(sessionId),
            applyHistoryState: (state) => storage.getState().applyMessageHistoryState(sessionId, state),
            applyLoading: () => storage.getState().applyMessageHistoryState(sessionId, { isLoadingBefore: true }),
            resetLoading: () => storage.getState().applyMessageHistoryState(sessionId, { isLoadingBefore: false }),
            applyFailure: () => this.olderMessagesRetryGuard.recordFailure(sessionId),
            isCurrent: () => this.accountLifecycle.isCurrent(generation),
        });
        log.log(`💬 fetchOlderMessages completed for session ${sessionId} - processed ${processedCount} messages`);
    }

    private applyLifecycleThinkingState(sessionId: string, lifecycleThinkingState: boolean | null) {
        const updatedSession = buildLifecycleThinkingSessionUpdate(
            storage.getState().sessions[sessionId],
            lifecycleThinkingState,
            Date.now(),
        );
        if (updatedSession) {
            this.applySessions([updatedSession]);
        }
    }

    private registerPushToken = async (generation: number) => {
        log.log('registerPushToken');
        const credentials = this.credentials;
        if (!credentials) {
            return;
        }
        await runPushTokenSync({
            generation,
            credentials,
            runRequest: (requestGeneration, operation) => this.accountLifecycle.runRequest(requestGeneration, operation),
            syncPushToken: (pushCredentials, signal) => syncCurrentPushToken(pushCredentials, signal),
            log: (message) => log.log(message),
            warn: (message) => console.warn(message),
        });
    }

    private subscribeToUpdates = (generation: number) => {
        this.cancelRealtimeSubscriptions?.();
        this.cancelRealtimeSubscriptions = bindSyncRealtimeEvents({
            socket: apiSocket,
            generation,
            handleUpdate: (update, updateGeneration) => this.handleUpdate(update, updateGeneration),
            handleEphemeralUpdate: (update, updateGeneration) => this.handleEphemeralUpdate(update, updateGeneration),
            handleReconnect: (reconnectGeneration) => {
                const applied = runReconnectSyncApplication({
                    isCurrentAccount: this.accountLifecycle.isCurrent(reconnectGeneration),
                    invalidateSessions: () => this.sessionsSync.invalidate(),
                    invalidateMachines: () => this.machinesSync.invalidate(),
                    invalidateArtifacts: () => {
                        log.log('🔌 Socket reconnected: Invalidating artifacts sync');
                        this.artifactsSync.invalidate();
                    },
                    // Messages are fetched lazily per-session via onSessionVisible (called by SessionView
                    // when realtimeStatus changes). Session metadata + agentState (including permission
                    // requests) are already refreshed by sessionsSync.invalidate() above.
                    retryPendingSends: () => {
                        for (const sync of this.sendSync.values()) {
                            sync.invalidate();
                        }
                    },
                });
                if (applied) log.log('🔌 Socket reconnected');
            },
            isCurrent: () => this.accountLifecycle.isCurrent(generation),
            reportError: (error) => console.error('Failed to handle account update:', error),
        });
    }

    private handleUpdate = async (update: unknown, generation: number) => {
        const contexts = createSyncRealtimeUpdateContexts({
            generation,
            assertCurrent: (accountGeneration) => this.accountLifecycle.assertCurrent(accountGeneration),
            message: {
                getSession: (sessionId) => storage.getState().sessions[sessionId],
                getSessionEncryption: (sessionId) => this.encryption.getSessionEncryption(sessionId),
                getCurrentLastSeq: (sessionId) => this.messagePagination.getLastSeq(sessionId),
                refreshMissingSession: (sessionId) => this.refreshMissingSession(sessionId),
                invalidateMessages: (sessionId) => this.getMessagesSync(sessionId).invalidate(),
                applySession: (session) => this.applySessions([session]),
                enqueueMessage: (sessionId, message) => this.enqueueMessages(sessionId, [message]),
                setLastSeq: (sessionId, seq) => this.messagePagination.setLastSeq(sessionId, seq),
                isMutableToolCall: (sessionId, toolUseId) => storage.getState().isMutableToolCall(sessionId, toolUseId),
                invalidateGitStatus: (sessionId) => gitStatusSync.invalidate(sessionId),
                onDecryptError: (error, sessionId) => console.error(`Failed to decrypt realtime message for ${sessionId}:`, error),
                onEmptyDecryption: (sessionId) => console.error(`Realtime message decryption returned no payload for ${sessionId}`),
                onUnreadMessage: notifyUnreadMessage,
            },
            session: {
                getSession: (sessionId) => storage.getState().sessions[sessionId],
                ensureSessionLoaded: (sessionId) => this.ensureSessionLoaded(sessionId),
                getSessionEncryption: (sessionId) => this.encryption.getSessionEncryption(sessionId),
                refreshMissingSession: (sessionId) => this.refreshMissingSession(sessionId),
                invalidateSessions: () => this.sessionsSync.invalidate(),
                applySession: (session) => this.applySessions([session]),
                invalidateGitStatus: (sessionId) => gitStatusSync.invalidate(sessionId),
                refreshMessages: (sessionId) => this.onSessionVisible(sessionId),
                deleteSession: (sessionId) => storage.getState().deleteSession(sessionId),
                removeSessionEncryption: (sessionId) => this.encryption.removeSessionEncryption(sessionId),
                removeProjectSession: (sessionId) => projectManager.removeSession(sessionId),
                cleanupResources: (sessionId) => cleanupDeletedSession(sessionId, {
                    clearGitStatus: (cleanupId) => gitStatusSync.clearForSession(cleanupId),
                    deleteMessagesSync: (cleanupId) => this.messagesSync.delete(cleanupId),
                    deleteSendSync: (cleanupId) => this.sendSync.delete(cleanupId),
                    deleteOlderMessagesSync: (cleanupId) => this.olderMessagesSync.delete(cleanupId),
                    clearOlderMessagesRetryGuard: (cleanupId) => this.olderMessagesRetryGuard.clear(cleanupId),
                    deletePendingOutbox: (cleanupId) => this.outbox.deletePending(cleanupId),
                    clearMessagePagination: (cleanupId) => this.messagePagination.clearSession(cleanupId),
                    clearMessageIngest: (cleanupId) => this.messageIngest.clearSession(cleanupId),
                }),
                log: (message) => log.log(message),
                logError: (message, error) => console.error(message, error),
            },
            account: {
                currentProfile: storage.getState().profile,
                decryptSettings: (value) => this.encryption.decryptRaw(value),
                applyProfile: (profile) => storage.getState().applyProfile(profile),
                applySettings: (settings, version) => {
                    this.applyServerSettings(settings, version);
                },
                invalidateSettings: () => this.settingsSync.invalidate(),
                log: (message) => log.log(message),
                logError: (message, error) => console.error(message, error),
                warn: (message) => console.warn(message),
            },
            machine: {
                getMachine: (machineId) => storage.getState().machines[machineId],
                decryptDataEncryptionKey: (value) => this.encryption.decryptEncryptionKey(value),
                storeDataKey: (id, key) => this.dataKeys.set('machine', id, key),
                initializeMachines: (machineKeys) => this.encryption.initializeMachines(machineKeys),
                getMachineEncryption: (machineId) => this.encryption.getMachineEncryption(machineId),
                invalidateMachines: () => this.machinesSync.invalidate(),
                applyMachine: (machine) => storage.getState().applyMachines([machine]),
                hasMachine: (machineId) => Boolean(storage.getState().machines[machineId]),
                deleteMachine: (id) => storage.getState().deleteMachine(id),
                removeMachineEncryption: (id) => this.encryption.removeMachineEncryption(id),
                deleteDataKey: (id) => this.dataKeys.delete('machine', id),
                log: (message) => log.log(message),
                logError: (message, error) => console.error(message, error),
            },
            artifact: {
                getArtifact: (artifactId) => storage.getState().artifacts[artifactId],
                getDataEncryptionKey: (artifactId) => this.dataKeys.get('artifact', artifactId),
                decryptEncryptionKey: (value) => this.encryption.decryptEncryptionKey(value),
                storeDataKey: (id, key) => this.dataKeys.set('artifact', id, key),
                createEncryption: (key) => new ArtifactEncryption(key),
                invalidateArtifacts: () => this.artifactsSync.invalidate(),
                addArtifact: (artifact) => storage.getState().addArtifact(artifact),
                applyArtifact: (artifact) => storage.getState().updateArtifact(artifact),
                deleteArtifact: (id) => storage.getState().deleteArtifact(id),
                deleteDataKey: (id) => this.dataKeys.delete('artifact', id),
                log: (message) => log.log(message),
                logError: (message, error) => console.error(message, error),
            },
        });
        await runRealtimeUpdateLifecycle({
            update,
            generation,
            assertCurrent: () => this.accountLifecycle.assertCurrent(generation),
            ...contexts,
            warnInvalid: (message) => console.warn(message),
            errorInvalid: (message, detail) => console.error(message, detail),
        });
    }

    private flushActivityUpdates = (updates: Map<string, ApiEphemeralActivityUpdate>) => {
        runActivityFlushLifecycle({
            updates,
            getSessions: () => storage.getState().sessions,
            applySessions: (sessions) => this.applySessions(sessions),
        });
    }

    private handleEphemeralUpdate = (update: unknown, generation: number) => {
        const context = createSyncEphemeralUpdateContext({
            generation,
            isCurrent: (accountGeneration) => this.accountLifecycle.isCurrent(accountGeneration),
            addActivity: (updateData) => this.activityAccumulator.addUpdate(updateData),
            getMachine: (machineId) => storage.getState().machines[machineId],
            applyMachine: (machine) => storage.getState().applyMachines([machine]),
            invalidateMachines: () => this.machinesSync.invalidate(),
            applySessionUsage: (sessionId, usage) => {
                storage.getState().applySessionUsage(sessionId, usage);
            },
            applySessionControl: (updateData) => sessionControlStore.getState().apply(updateData),
            warn: (message) => console.warn(message),
            error: (message, detail) => console.error(message, detail),
        });
        dispatchEphemeralRealtimeUpdate(update, generation, context);
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
        storage.getState().applySessions(sessions, replace);
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
    await runSyncInitializationApplication({
        credentials,
        restore,
        endpoint: getServerUrl(),
        deviceId: getOrCreateDeviceId(),
        appState: AppState.currentState,
        decodeSecret: (secret) => decodeBase64(secret, 'base64url'),
        createEncryption: (secretKey) => initializationLifecycle.runRequest(
            initializationGeneration,
            () => Encryption.create(secretKey),
        ),
        assertCurrent: () => initializationLifecycle.assertCurrent(initializationGeneration),
        initializeTracking,
        initializeSocket: (options, encryption) => apiSocket.initialize(options, encryption),
        onSocketStatusChange: (listener) => apiSocket.onStatusChange(listener),
        setSocketStatus: (status) => storage.getState().setSocketStatus(status),
        createAccount: (accountCredentials, encryption) => sync.create(accountCredentials, encryption),
        restoreAccount: (accountCredentials, encryption) => sync.restore(accountCredentials, encryption),
    });
}
