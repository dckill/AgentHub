import { MMKV } from 'react-native-mmkv';
import { Settings, settingsDefaults, settingsParse, SettingsSchema } from './settings';
import { LocalSettings, localSettingsDefaults, localSettingsParse } from './localSettings';
import { Purchases, purchasesDefaults, purchasesParse } from './purchases';
import { Profile, profileDefaults, profileParse } from './profile';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';
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

export function loadSettings(): { settings: Settings, version: number | null } {
    const settings = mmkv.getString('settings');
    if (settings) {
        try {
            const parsed = JSON.parse(settings);
            return { settings: settingsParse(parsed.settings), version: parsed.version };
        } catch (e) {
            console.error('Failed to parse settings', e);
            return { settings: { ...settingsDefaults }, version: null };
        }
    }
    return { settings: { ...settingsDefaults }, version: null };
}

export function saveSettings(settings: Settings, version: number) {
    mmkv.set('settings', JSON.stringify({ settings, version }));
}

export function loadPendingSettings(): Partial<Settings> {
    const pending = mmkv.getString('pending-settings');
    if (pending) {
        try {
            const parsed = JSON.parse(pending);
            return SettingsSchema.partial().parse(parsed);
        } catch (e) {
            console.error('Failed to parse pending settings', e);
            return {};
        }
    }
    return {};
}

export function savePendingSettings(settings: Partial<Settings>) {
    mmkv.set('pending-settings', JSON.stringify(settings));
}

export function loadLocalSettings(): LocalSettings {
    const localSettings = mmkv.getString('local-settings');
    if (localSettings) {
        try {
            const parsed = JSON.parse(localSettings);
            return localSettingsParse(parsed);
        } catch (e) {
            console.error('Failed to parse local settings', e);
            return { ...localSettingsDefaults };
        }
    }
    return { ...localSettingsDefaults };
}

export function saveLocalSettings(settings: LocalSettings) {
    mmkv.set('local-settings', JSON.stringify(settings));
}

export function loadThemePreference(): 'light' | 'dark' | 'adaptive' {
    const localSettings = mmkv.getString('local-settings');
    if (localSettings) {
        try {
            const parsed = JSON.parse(localSettings);
            const settings = localSettingsParse(parsed);
            return settings.themePreference;
        } catch (e) {
            console.error('Failed to parse local settings for theme preference', e);
            return localSettingsDefaults.themePreference;
        }
    }
    return localSettingsDefaults.themePreference;
}

export function loadPurchases(): Purchases {
    const purchases = mmkv.getString('purchases');
    if (purchases) {
        try {
            const parsed = JSON.parse(purchases);
            return purchasesParse(parsed);
        } catch (e) {
            console.error('Failed to parse purchases', e);
            return { ...purchasesDefaults };
        }
    }
    return { ...purchasesDefaults };
}

export function savePurchases(purchases: Purchases) {
    mmkv.set('purchases', JSON.stringify(purchases));
}

export function loadSessionDrafts(): Record<string, string> {
    const drafts = mmkv.getString('session-drafts');
    if (drafts) {
        try {
            return JSON.parse(drafts);
        } catch (e) {
            console.error('Failed to parse session drafts', e);
            return {};
        }
    }
    return {};
}

export function saveSessionDrafts(drafts: Record<string, string>) {
    mmkv.set('session-drafts', JSON.stringify(drafts));
}

export function loadNewSessionDraft(): NewSessionDraft | null {
    const raw = mmkv.getString(NEW_SESSION_DRAFT_KEY);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
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

        return {
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
    } catch (e) {
        console.error('Failed to parse new session draft', e);
        return null;
    }
}

export function saveNewSessionDraft(draft: NewSessionDraft) {
    mmkv.set(NEW_SESSION_DRAFT_KEY, JSON.stringify(draft));
}

export function clearNewSessionDraft() {
    mmkv.delete(NEW_SESSION_DRAFT_KEY);
}

export function loadRegisteredPushToken(): string | null {
    return mmkv.getString(REGISTERED_PUSH_TOKEN_KEY) ?? null;
}

export function saveRegisteredPushToken(token: string) {
    mmkv.set(REGISTERED_PUSH_TOKEN_KEY, token);
}

export function clearRegisteredPushToken() {
    mmkv.delete(REGISTERED_PUSH_TOKEN_KEY);
}

export function loadFileTransferTasks(): FileTransferTask[] {
    const raw = mmkv.getString(FILE_TRANSFER_TASKS_KEY);
    if (!raw) {
        return [];
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((item): item is FileTransferTask => {
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
    } catch (e) {
        console.error('Failed to parse file transfer tasks', e);
        return [];
    }
}

export function saveFileTransferTasks(tasks: FileTransferTask[]) {
    mmkv.set(FILE_TRANSFER_TASKS_KEY, JSON.stringify(tasks));
}

export function loadFileTransferSettings(): FileTransferSettings {
    const raw = mmkv.getString(FILE_TRANSFER_SETTINGS_KEY);
    if (!raw) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }
        return {
            downloadDirectoryUri: typeof parsed.downloadDirectoryUri === 'string' ? parsed.downloadDirectoryUri : undefined,
            downloadDirectoryLabel: typeof parsed.downloadDirectoryLabel === 'string' ? parsed.downloadDirectoryLabel : undefined,
            deleteLocalFileOnRemove: parsed.deleteLocalFileOnRemove === true,
        };
    } catch (e) {
        console.error('Failed to parse file transfer settings', e);
        return {};
    }
}

export function saveFileTransferSettings(settings: FileTransferSettings) {
    mmkv.set(FILE_TRANSFER_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSessionPermissionModes(): Record<string, string> {
    const modes = mmkv.getString('session-permission-modes');
    if (modes) {
        try {
            return JSON.parse(modes);
        } catch (e) {
            console.error('Failed to parse session permission modes', e);
            return {};
        }
    }
    return {};
}

export function saveSessionPermissionModes(modes: Record<string, string>) {
    mmkv.set('session-permission-modes', JSON.stringify(modes));
}

export function loadSessionModelModes(): Record<string, string> {
    const modes = mmkv.getString('session-model-modes');
    if (modes) {
        try {
            return JSON.parse(modes);
        } catch (e) {
            console.error('Failed to parse session model modes', e);
            return {};
        }
    }
    return {};
}

export function saveSessionModelModes(modes: Record<string, string>) {
    mmkv.set('session-model-modes', JSON.stringify(modes));
}

export function loadSessionEffortLevels(): Record<string, string> {
    const levels = mmkv.getString('session-effort-levels');
    if (levels) {
        try {
            return JSON.parse(levels);
        } catch (e) {
            console.error('Failed to parse session effort levels', e);
            return {};
        }
    }
    return {};
}

export function saveSessionEffortLevels(levels: Record<string, string>) {
    mmkv.set('session-effort-levels', JSON.stringify(levels));
}

export function loadSessionLastViewedAt(): Record<string, number> {
    return loadNumberMap(SESSION_LAST_VIEWED_AT_KEY, 'session last viewed timestamps');
}

export function saveSessionLastViewedAt(viewedAt: Record<string, number>) {
    saveNumberMap(SESSION_LAST_VIEWED_AT_KEY, viewedAt);
}

export function loadSessionUnviewedCompletionAt(): Record<string, number> {
    return loadNumberMap(SESSION_UNVIEWED_COMPLETION_AT_KEY, 'session unviewed completion timestamps');
}

export function saveSessionUnviewedCompletionAt(completionAt: Record<string, number>) {
    saveNumberMap(SESSION_UNVIEWED_COMPLETION_AT_KEY, completionAt);
}

export function loadSessionLastViewedState(): Record<string, string> {
    return loadStringMap(SESSION_LAST_VIEWED_STATE_KEY, 'session last viewed states');
}

export function saveSessionLastViewedState(states: Record<string, string>) {
    saveStringMap(SESSION_LAST_VIEWED_STATE_KEY, states);
}

export function loadProfile(): Profile {
    const profile = mmkv.getString('profile');
    if (profile) {
        try {
            const parsed = JSON.parse(profile);
            return profileParse(parsed);
        } catch (e) {
            console.error('Failed to parse profile', e);
            return { ...profileDefaults };
        }
    }
    return { ...profileDefaults };
}

export function saveProfile(profile: Profile) {
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
}
