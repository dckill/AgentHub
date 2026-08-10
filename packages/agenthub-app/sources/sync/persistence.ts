import { MMKV } from 'react-native-mmkv';
import { Settings, settingsDefaults, settingsParse, SettingsSchema } from './settings';
import { LocalSettings, localSettingsDefaults, localSettingsParse } from './localSettings';
import { Purchases, purchasesDefaults, purchasesParse } from './purchases';
import { Profile, profileDefaults, profileParse } from './profile';
import type { PermissionModeKey } from '@/utils/permissionMode';
import { coerceSupportedClientAgent, type SupportedClientAgent } from './agentTypes';
import type { FileTransferSettings, FileTransferTask } from '@/utils/fileTransfers';

const mmkv = new MMKV();
const NEW_SESSION_DRAFT_KEY = 'new-session-draft-v1';
const REGISTERED_PUSH_TOKEN_KEY = 'registered-push-token-v1';
const FILE_TRANSFER_TASKS_KEY = 'file-transfer-tasks-v1';
const FILE_TRANSFER_SETTINGS_KEY = 'file-transfer-settings-v1';
const SESSION_LAST_VIEWED_AT_KEY = 'session-last-viewed-at-v1';
const SESSION_UNVIEWED_COMPLETION_AT_KEY = 'session-unviewed-completion-at-v1';
const SESSION_LAST_VIEWED_STATE_KEY = 'session-last-viewed-state-v1';

function loadNumberMap(key: string, logLabel: string): Record<string, number> {
    const raw = mmkv.getString(key);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return {};
            }
            return Object.fromEntries(
                Object.entries(parsed).filter((entry): entry is [string, number] => (
                    typeof entry[0] === 'string' && typeof entry[1] === 'number'
                )),
            );
        } catch (e) {
            console.error(`Failed to parse ${logLabel}`, e);
            return {};
        }
    }
    return {};
}

function saveNumberMap(key: string, value: Record<string, number>) {
    mmkv.set(key, JSON.stringify(value));
}

function loadStringMap(key: string, logLabel: string): Record<string, string> {
    const raw = mmkv.getString(key);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return {};
            }
            return Object.fromEntries(
                Object.entries(parsed).filter((entry): entry is [string, string] => (
                    typeof entry[0] === 'string' && typeof entry[1] === 'string'
                )),
            );
        } catch (e) {
            console.error(`Failed to parse ${logLabel}`, e);
            return {};
        }
    }
    return {};
}

function saveStringMap(key: string, value: Record<string, string>) {
    mmkv.set(key, JSON.stringify(value));
}

export type NewSessionAgentType = SupportedClientAgent;
export type NewSessionSessionType = 'simple' | 'worktree';

export interface NewSessionDraft {
    input: string;
    selectedMachineId: string | null;
    selectedPath: string | null;
    agentType: NewSessionAgentType;
    permissionMode: PermissionModeKey;
    modelMode: string;
    effortLevel: string;
    sessionType: NewSessionSessionType;
    worktreeKey: string | null;
    selectedCredentialId: string | null;
    updatedAt: number;
}

// The new-session store reads this value during initialization and then persists
// every field update. Keep a module-local snapshot so repeated consumers do not
// re-parse the same MMKV payload; writes and clears replace the snapshot.
let newSessionDraftCache: NewSessionDraft | null | undefined;
let settingsCache: { settings: Settings, version: number | null } | undefined;
let pendingSettingsCache: Partial<Settings> | undefined;
let localSettingsCache: LocalSettings | undefined;
let sessionDraftsCache: Record<string, string> | undefined;
let purchasesCache: Purchases | undefined;
let profileCache: Profile | undefined;
let fileTransferTasksCache: FileTransferTask[] | undefined;
let fileTransferSettingsCache: FileTransferSettings | undefined;
let sessionPermissionModesCache: Record<string, string> | undefined;
let sessionModelModesCache: Record<string, string> | undefined;
let sessionEffortLevelsCache: Record<string, string> | undefined;
let registeredPushTokenCache: string | null | undefined;
let sessionLastViewedAtCache: Record<string, number> | undefined;
let sessionUnviewedCompletionAtCache: Record<string, number> | undefined;
let sessionLastViewedStateCache: Record<string, string> | undefined;

function cloneLocalSettings(settings: LocalSettings): LocalSettings {
    return {
        ...settings,
        sidebarPanelsOpen: [...settings.sidebarPanelsOpen],
        acknowledgedCliVersions: { ...settings.acknowledgedCliVersions },
    };
}

function cloneSettings(settings: Settings): Settings {
    return {
        ...settings,
        recentMachinePaths: settings.recentMachinePaths.map((entry) => ({ ...entry })),
        dismissedCLIWarnings: {
            perMachine: Object.fromEntries(
                Object.entries(settings.dismissedCLIWarnings.perMachine).map(([machineId, warning]) => (
                    [machineId, { ...warning }]
                )),
            ),
            global: { ...settings.dismissedCLIWarnings.global },
        },
        machineGroups: { ...settings.machineGroups },
        machineGroupOrder: [...settings.machineGroupOrder],
        projectCustomizations: Object.fromEntries(
            Object.entries(settings.projectCustomizations).map(([projectId, customization]) => (
                [projectId, { ...customization }]
            )),
        ),
    };
}

function clonePendingSettings(settings: Partial<Settings>): Partial<Settings> {
    return {
        ...settings,
        recentMachinePaths: settings.recentMachinePaths?.map((entry) => ({ ...entry })),
        dismissedCLIWarnings: settings.dismissedCLIWarnings ? {
            perMachine: Object.fromEntries(
                Object.entries(settings.dismissedCLIWarnings.perMachine).map(([machineId, warning]) => (
                    [machineId, { ...warning }]
                )),
            ),
            global: { ...settings.dismissedCLIWarnings.global },
        } : undefined,
        machineGroups: settings.machineGroups ? { ...settings.machineGroups } : undefined,
        machineGroupOrder: settings.machineGroupOrder ? [...settings.machineGroupOrder] : undefined,
        projectCustomizations: settings.projectCustomizations ? Object.fromEntries(
            Object.entries(settings.projectCustomizations).map(([projectId, customization]) => (
                [projectId, { ...customization }]
            )),
        ) : undefined,
    };
}

function clonePurchases(purchases: Purchases): Purchases {
    return {
        activeSubscriptions: [...purchases.activeSubscriptions],
        entitlements: { ...purchases.entitlements },
    };
}

function cloneProfile(profile: Profile): Profile {
    return {
        ...profile,
        avatar: profile.avatar ? { ...profile.avatar } : null,
    };
}

function cloneFileTransferTasks(tasks: FileTransferTask[]): FileTransferTask[] {
    return tasks.map((task) => ({ ...task }));
}

function cloneFileTransferSettings(settings: FileTransferSettings): FileTransferSettings {
    return { ...settings };
}

export function loadSettings(): { settings: Settings, version: number | null } {
    if (settingsCache) {
        return { settings: cloneSettings(settingsCache.settings), version: settingsCache.version };
    }

    const settings = mmkv.getString('settings');
    if (settings) {
        try {
            const parsed = JSON.parse(settings);
            settingsCache = { settings: settingsParse(parsed.settings), version: parsed.version };
            return { settings: cloneSettings(settingsCache.settings), version: settingsCache.version };
        } catch (e) {
            console.error('Failed to parse settings', e);
            settingsCache = { settings: { ...settingsDefaults }, version: null };
            return { settings: cloneSettings(settingsCache.settings), version: settingsCache.version };
        }
    }
    settingsCache = { settings: { ...settingsDefaults }, version: null };
    return { settings: cloneSettings(settingsCache.settings), version: settingsCache.version };
}

export function saveSettings(settings: Settings, version: number) {
    settingsCache = { settings: cloneSettings(settings), version };
    mmkv.set('settings', JSON.stringify({ settings, version }));
}

export function loadPendingSettings(): Partial<Settings> {
    if (pendingSettingsCache !== undefined) {
        return clonePendingSettings(pendingSettingsCache);
    }

    const pending = mmkv.getString('pending-settings');
    if (pending) {
        try {
            const parsed = JSON.parse(pending);
            pendingSettingsCache = SettingsSchema.partial().parse(parsed);
            return clonePendingSettings(pendingSettingsCache);
        } catch (e) {
            console.error('Failed to parse pending settings', e);
            pendingSettingsCache = {};
            return {};
        }
    }
    pendingSettingsCache = {};
    return {};
}

export function savePendingSettings(settings: Partial<Settings>) {
    pendingSettingsCache = clonePendingSettings(settings);
    mmkv.set('pending-settings', JSON.stringify(settings));
}

export function loadLocalSettings(): LocalSettings {
    if (localSettingsCache) {
        return cloneLocalSettings(localSettingsCache);
    }

    const localSettings = mmkv.getString('local-settings');
    if (localSettings) {
        try {
            const parsed = JSON.parse(localSettings);
            localSettingsCache = localSettingsParse(parsed);
            return cloneLocalSettings(localSettingsCache);
        } catch (e) {
            console.error('Failed to parse local settings', e);
            localSettingsCache = { ...localSettingsDefaults };
            return cloneLocalSettings(localSettingsCache);
        }
    }
    localSettingsCache = { ...localSettingsDefaults };
    return cloneLocalSettings(localSettingsCache);
}

export function saveLocalSettings(settings: LocalSettings) {
    localSettingsCache = cloneLocalSettings(settings);
    mmkv.set('local-settings', JSON.stringify(settings));
}

export function loadThemePreference(): 'light' | 'dark' | 'adaptive' {
    return loadLocalSettings().themePreference;
}

export function loadPurchases(): Purchases {
    if (purchasesCache) {
        return clonePurchases(purchasesCache);
    }

    const purchases = mmkv.getString('purchases');
    if (purchases) {
        try {
            const parsed = JSON.parse(purchases);
            purchasesCache = purchasesParse(parsed);
            return clonePurchases(purchasesCache);
        } catch (e) {
            console.error('Failed to parse purchases', e);
            purchasesCache = clonePurchases(purchasesDefaults);
            return clonePurchases(purchasesCache);
        }
    }
    purchasesCache = clonePurchases(purchasesDefaults);
    return clonePurchases(purchasesCache);
}

export function savePurchases(purchases: Purchases) {
    purchasesCache = clonePurchases(purchases);
    mmkv.set('purchases', JSON.stringify(purchases));
}

export function loadSessionDrafts(): Record<string, string> {
    if (sessionDraftsCache !== undefined) {
        return { ...sessionDraftsCache };
    }

    sessionDraftsCache = loadStringMap('session-drafts', 'session drafts');
    return { ...sessionDraftsCache };
}

export function saveSessionDrafts(drafts: Record<string, string>) {
    sessionDraftsCache = { ...drafts };
    mmkv.set('session-drafts', JSON.stringify(drafts));
}

export function loadNewSessionDraft(): NewSessionDraft | null {
    if (newSessionDraftCache !== undefined) {
        return newSessionDraftCache ? { ...newSessionDraftCache } : null;
    }

    const raw = mmkv.getString(NEW_SESSION_DRAFT_KEY);
    if (!raw) {
        newSessionDraftCache = null;
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            newSessionDraftCache = null;
            return null;
        }

        const input = typeof parsed.input === 'string' ? parsed.input : '';
        const selectedMachineId = typeof parsed.selectedMachineId === 'string' ? parsed.selectedMachineId : null;
        const selectedPath = typeof parsed.selectedPath === 'string' ? parsed.selectedPath : null;
        const agentType: NewSessionAgentType = typeof parsed.agentType === 'string'
            ? coerceSupportedClientAgent(parsed.agentType)
            : 'codex';
        const permissionMode: PermissionModeKey = typeof parsed.permissionMode === 'string'
            ? parsed.permissionMode
            : 'yolo';
        const modelMode: string = typeof parsed.modelMode === 'string' ? parsed.modelMode : 'default';
        const effortLevel: string = typeof parsed.effortLevel === 'string' ? parsed.effortLevel : 'medium';
        const sessionType: NewSessionSessionType = parsed.sessionType === 'worktree' ? 'worktree' : 'simple';
        const worktreeKey = typeof parsed.worktreeKey === 'string' ? parsed.worktreeKey : null;
        const selectedCredentialId = typeof parsed.selectedCredentialId === 'string' ? parsed.selectedCredentialId : null;
        const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now();

        newSessionDraftCache = {
            input,
            selectedMachineId,
            selectedPath,
            agentType,
            permissionMode,
            modelMode,
            effortLevel,
            sessionType,
            worktreeKey,
            selectedCredentialId,
            updatedAt,
        };
        return { ...newSessionDraftCache };
    } catch (e) {
        console.error('Failed to parse new session draft', e);
        newSessionDraftCache = null;
        return null;
    }
}

export function saveNewSessionDraft(draft: NewSessionDraft) {
    newSessionDraftCache = { ...draft };
    mmkv.set(NEW_SESSION_DRAFT_KEY, JSON.stringify(draft));
}

export function clearNewSessionDraft() {
    newSessionDraftCache = null;
    mmkv.delete(NEW_SESSION_DRAFT_KEY);
}

export function loadRegisteredPushToken(): string | null {
    if (registeredPushTokenCache !== undefined) {
        return registeredPushTokenCache;
    }

    registeredPushTokenCache = mmkv.getString(REGISTERED_PUSH_TOKEN_KEY) ?? null;
    return registeredPushTokenCache;
}

export function saveRegisteredPushToken(token: string) {
    registeredPushTokenCache = token;
    mmkv.set(REGISTERED_PUSH_TOKEN_KEY, token);
}

export function clearRegisteredPushToken() {
    registeredPushTokenCache = null;
    mmkv.delete(REGISTERED_PUSH_TOKEN_KEY);
}

export function loadFileTransferTasks(): FileTransferTask[] {
    if (fileTransferTasksCache !== undefined) {
        return cloneFileTransferTasks(fileTransferTasksCache);
    }

    const raw = mmkv.getString(FILE_TRANSFER_TASKS_KEY);
    if (!raw) {
        fileTransferTasksCache = [];
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            fileTransferTasksCache = [];
            return [];
        }
        fileTransferTasksCache = parsed.filter((item): item is FileTransferTask => {
            return item
                && typeof item === 'object'
                && typeof item.id === 'string'
                && typeof item.machineId === 'string'
                && item.direction === 'download'
                && typeof item.remotePath === 'string'
                && typeof item.fileName === 'string'
                && typeof item.status === 'string'
                && typeof item.downloadedBytes === 'number'
                && typeof item.createdAt === 'number'
                && typeof item.updatedAt === 'number';
        });
        return cloneFileTransferTasks(fileTransferTasksCache);
    } catch (e) {
        console.error('Failed to parse file transfer tasks', e);
        fileTransferTasksCache = [];
        return [];
    }
}

export function saveFileTransferTasks(tasks: FileTransferTask[]) {
    fileTransferTasksCache = cloneFileTransferTasks(tasks);
    mmkv.set(FILE_TRANSFER_TASKS_KEY, JSON.stringify(tasks));
}

export function loadFileTransferSettings(): FileTransferSettings {
    if (fileTransferSettingsCache !== undefined) {
        return cloneFileTransferSettings(fileTransferSettingsCache);
    }

    const raw = mmkv.getString(FILE_TRANSFER_SETTINGS_KEY);
    if (!raw) {
        fileTransferSettingsCache = {};
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            fileTransferSettingsCache = {};
            return {};
        }
        fileTransferSettingsCache = {
            downloadDirectoryUri: typeof parsed.downloadDirectoryUri === 'string' ? parsed.downloadDirectoryUri : undefined,
            downloadDirectoryLabel: typeof parsed.downloadDirectoryLabel === 'string' ? parsed.downloadDirectoryLabel : undefined,
            deleteLocalFileOnRemove: parsed.deleteLocalFileOnRemove === true,
        };
        return cloneFileTransferSettings(fileTransferSettingsCache);
    } catch (e) {
        console.error('Failed to parse file transfer settings', e);
        fileTransferSettingsCache = {};
        return {};
    }
}

export function saveFileTransferSettings(settings: FileTransferSettings) {
    fileTransferSettingsCache = cloneFileTransferSettings(settings);
    mmkv.set(FILE_TRANSFER_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSessionPermissionModes(): Record<string, string> {
    if (sessionPermissionModesCache !== undefined) return { ...sessionPermissionModesCache };
    sessionPermissionModesCache = loadStringMap('session-permission-modes', 'session permission modes');
    return { ...sessionPermissionModesCache };
}

export function saveSessionPermissionModes(modes: Record<string, string>) {
    sessionPermissionModesCache = { ...modes };
    mmkv.set('session-permission-modes', JSON.stringify(modes));
}

export function loadSessionModelModes(): Record<string, string> {
    if (sessionModelModesCache !== undefined) return { ...sessionModelModesCache };
    sessionModelModesCache = loadStringMap('session-model-modes', 'session model modes');
    return { ...sessionModelModesCache };
}

export function saveSessionModelModes(modes: Record<string, string>) {
    sessionModelModesCache = { ...modes };
    mmkv.set('session-model-modes', JSON.stringify(modes));
}

export function loadSessionEffortLevels(): Record<string, string> {
    if (sessionEffortLevelsCache !== undefined) return { ...sessionEffortLevelsCache };
    sessionEffortLevelsCache = loadStringMap('session-effort-levels', 'session effort levels');
    return { ...sessionEffortLevelsCache };
}

export function saveSessionEffortLevels(levels: Record<string, string>) {
    sessionEffortLevelsCache = { ...levels };
    mmkv.set('session-effort-levels', JSON.stringify(levels));
}

export function loadSessionLastViewedAt(): Record<string, number> {
    if (sessionLastViewedAtCache !== undefined) {
        return { ...sessionLastViewedAtCache };
    }
    sessionLastViewedAtCache = loadNumberMap(SESSION_LAST_VIEWED_AT_KEY, 'session last viewed timestamps');
    return { ...sessionLastViewedAtCache };
}

export function saveSessionLastViewedAt(viewedAt: Record<string, number>) {
    sessionLastViewedAtCache = { ...viewedAt };
    saveNumberMap(SESSION_LAST_VIEWED_AT_KEY, viewedAt);
}

export function loadSessionUnviewedCompletionAt(): Record<string, number> {
    if (sessionUnviewedCompletionAtCache !== undefined) {
        return { ...sessionUnviewedCompletionAtCache };
    }
    sessionUnviewedCompletionAtCache = loadNumberMap(SESSION_UNVIEWED_COMPLETION_AT_KEY, 'session unviewed completion timestamps');
    return { ...sessionUnviewedCompletionAtCache };
}

export function saveSessionUnviewedCompletionAt(completionAt: Record<string, number>) {
    sessionUnviewedCompletionAtCache = { ...completionAt };
    saveNumberMap(SESSION_UNVIEWED_COMPLETION_AT_KEY, completionAt);
}

export function loadSessionLastViewedState(): Record<string, string> {
    if (sessionLastViewedStateCache !== undefined) {
        return { ...sessionLastViewedStateCache };
    }
    sessionLastViewedStateCache = loadStringMap(SESSION_LAST_VIEWED_STATE_KEY, 'session last viewed states');
    return { ...sessionLastViewedStateCache };
}

export function saveSessionLastViewedState(states: Record<string, string>) {
    sessionLastViewedStateCache = { ...states };
    saveStringMap(SESSION_LAST_VIEWED_STATE_KEY, states);
}

export function loadProfile(): Profile {
    if (profileCache) {
        return cloneProfile(profileCache);
    }

    const profile = mmkv.getString('profile');
    if (profile) {
        try {
            const parsed = JSON.parse(profile);
            profileCache = profileParse(parsed);
            return cloneProfile(profileCache);
        } catch (e) {
            console.error('Failed to parse profile', e);
            profileCache = cloneProfile(profileDefaults);
            return cloneProfile(profileCache);
        }
    }
    profileCache = cloneProfile(profileDefaults);
    return cloneProfile(profileCache);
}

export function saveProfile(profile: Profile) {
    profileCache = cloneProfile(profile);
    mmkv.set('profile', JSON.stringify(profile));
}

// Simple temporary text storage for passing large strings between screens
export function storeTempText(content: string): string {
    const id = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    mmkv.set(`temp_text_${id}`, content);
    return id;
}

export function retrieveTempText(id: string): string | null {
    const content = mmkv.getString(`temp_text_${id}`);
    if (content) {
        // Auto-delete after retrieval
        mmkv.delete(`temp_text_${id}`);
        return content;
    }
    return null;
}

export function clearPersistence() {
    mmkv.clearAll();
    newSessionDraftCache = undefined;
    settingsCache = undefined;
    pendingSettingsCache = undefined;
    localSettingsCache = undefined;
    sessionDraftsCache = undefined;
    purchasesCache = undefined;
    profileCache = undefined;
    fileTransferTasksCache = undefined;
    fileTransferSettingsCache = undefined;
    sessionPermissionModesCache = undefined;
    sessionModelModesCache = undefined;
    sessionEffortLevelsCache = undefined;
    registeredPushTokenCache = undefined;
    sessionLastViewedAtCache = undefined;
    sessionUnviewedCompletionAtCache = undefined;
    sessionLastViewedStateCache = undefined;
}
