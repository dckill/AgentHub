import { InvalidateSync } from '@/utils/sync';
import { runStartupSyncs, type StartupSyncTask } from './startupSyncScheduler';

export type AccountSyncs = {
    sessionsSync: InvalidateSync;
    settingsSync: InvalidateSync;
    profileSync: InvalidateSync;
    machinesSync: InvalidateSync;
    nativeUpdateSync: InvalidateSync;
    artifactsSync: InvalidateSync;
    pushTokenSync: InvalidateSync;
};

export type AccountSyncFactoryOptions = {
    generation: number;
    createSync: (run: () => Promise<void>) => InvalidateSync;
    fetchSessions: (generation: number) => Promise<void> | void;
    syncSettings: (generation: number) => Promise<void> | void;
    fetchProfile: (generation: number) => Promise<void> | void;
    fetchMachines: (generation: number) => Promise<void> | void;
    fetchNativeUpdate: (generation: number) => Promise<void> | void;
    fetchArtifactsList: (generation: number) => Promise<void> | void;
    registerPushToken: (generation: number) => Promise<void> | void;
    isDev: boolean;
    hasCredentials: () => boolean;
};

export function createAccountSyncs(options: AccountSyncFactoryOptions): AccountSyncs {
    const { generation, createSync } = options;
    const registerPushToken = async () => {
        if (options.isDev || !options.hasCredentials()) {
            return;
        }
        await options.registerPushToken(generation);
    };

    return {
        sessionsSync: createSync(async () => { await options.fetchSessions(generation); }),
        settingsSync: createSync(async () => { await options.syncSettings(generation); }),
        profileSync: createSync(async () => { await options.fetchProfile(generation); }),
        machinesSync: createSync(async () => { await options.fetchMachines(generation); }),
        nativeUpdateSync: createSync(async () => { await options.fetchNativeUpdate(generation); }),
        artifactsSync: createSync(async () => { await options.fetchArtifactsList(generation); }),
        pushTokenSync: createSync(registerPushToken),
    };
}

export type AccountInitializationOptions = {
    generation: number;
    deferBackgroundSyncs: boolean;
    syncs: AccountSyncs;
    subscribeToUpdates: (generation: number) => void;
    runIfCurrent: (generation: number, effect: () => void) => void;
    applyReady: () => void;
    previousCancel?: (() => void) | null;
    onBackgroundTaskError: (name: string, error: unknown) => void;
    onSessionLoadError: (error: unknown) => void;
};

export function initializeAccountSyncs(options: AccountInitializationOptions): () => void {
    options.subscribeToUpdates(options.generation);

    const startupSyncs: StartupSyncTask[] = [
        { name: 'sessions', run: () => options.runIfCurrent(options.generation, () => options.syncs.sessionsSync.invalidate()) },
        { name: 'settings', run: () => options.runIfCurrent(options.generation, () => options.syncs.settingsSync.invalidate()) },
        { name: 'profile', run: () => options.runIfCurrent(options.generation, () => options.syncs.profileSync.invalidate()) },
        { name: 'machines', run: () => options.runIfCurrent(options.generation, () => options.syncs.machinesSync.invalidate()) },
        { name: 'nativeUpdate', run: () => options.runIfCurrent(options.generation, () => options.syncs.nativeUpdateSync.invalidate()) },
        { name: 'artifacts', run: () => options.runIfCurrent(options.generation, () => options.syncs.artifactsSync.invalidate()) },
        { name: 'pushToken', run: () => options.runIfCurrent(options.generation, () => options.syncs.pushTokenSync.invalidate()) },
    ];

    options.previousCancel?.();
    const cancel = options.deferBackgroundSyncs
        ? runStartupSyncs({
            immediate: startupSyncs.slice(0, 1),
            background: startupSyncs.slice(1),
            onBackgroundTaskError: options.onBackgroundTaskError,
        })
        : runStartupSyncs({
            immediate: startupSyncs,
            background: [],
        });

    options.syncs.sessionsSync.awaitQueue().then(() => {
        options.runIfCurrent(options.generation, options.applyReady);
    }).catch((error) => {
        options.onSessionLoadError(error);
        options.runIfCurrent(options.generation, options.applyReady);
    });

    return cancel;
}
