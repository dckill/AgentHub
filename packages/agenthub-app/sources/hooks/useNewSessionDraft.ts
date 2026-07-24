/**
 * Zustand store for new session draft state, backed by MMKV.
 * Persists the user's last-used configuration (machine, path, agent, model, permissions, etc.)
 * so the new session screen restores the same defaults on next visit.
 */
import { create } from 'zustand';
import {
    loadNewSessionDraft,
    saveNewSessionDraft,
    type NewSessionDraft,
    type NewSessionAgentType,
    type NewSessionSessionType,
} from '@/sync/persistence';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';

interface NewSessionDraftState {
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

    setInput: (input: string) => void;
    setMachineId: (id: string | null) => void;
    setPath: (path: string | null) => void;
    setAgentType: (agent: NewSessionAgentType) => void;
    setPermissionMode: (mode: PermissionModeKey) => void;
    setModelMode: (mode: string) => void;
    setEffortLevel: (level: string) => void;
    setSessionType: (type: NewSessionSessionType) => void;
    setWorktreeKey: (key: string | null) => void;
    setCredentialId: (id: string | null) => void;
}

function persist(state: NewSessionDraftState) {
    saveNewSessionDraft({
        input: state.input,
        selectedMachineId: state.selectedMachineId,
        selectedPath: state.selectedPath,
        agentType: state.agentType,
        permissionMode: state.permissionMode,
        modelMode: state.modelMode,
        effortLevel: state.effortLevel,
        sessionType: state.sessionType,
        worktreeKey: state.worktreeKey,
        selectedCredentialId: state.selectedCredentialId,
        updatedAt: Date.now(),
    });
}

const initial = loadNewSessionDraft();

export const useNewSessionDraft = create<NewSessionDraftState>()((set, get) => ({
    input: initial?.input ?? '',
    selectedMachineId: initial?.selectedMachineId ?? null,
    selectedPath: initial?.selectedPath ?? null,
    agentType: initial?.agentType ?? 'codex',
    permissionMode: initial?.permissionMode ?? 'yolo',
    modelMode: initial?.modelMode ?? 'default',
    effortLevel: initial?.effortLevel ?? 'medium',
    sessionType: initial?.sessionType ?? 'simple',
    worktreeKey: initial?.worktreeKey ?? null,
    selectedCredentialId: initial?.selectedCredentialId ?? null,

    setInput: (input) => { set({ input }); persist(get()); },
    setMachineId: (id) => { set({ selectedMachineId: id, selectedPath: null, worktreeKey: null, selectedCredentialId: null }); persist(get()); },
    setPath: (path) => { set({ selectedPath: path, worktreeKey: null }); persist(get()); },
    setAgentType: (agent) => { set({ agentType: agent }); persist(get()); },
    setPermissionMode: (mode) => { set({ permissionMode: mode }); persist(get()); },
    setModelMode: (mode) => { set({ modelMode: mode }); persist(get()); },
    setEffortLevel: (level) => { set({ effortLevel: level }); persist(get()); },
    setSessionType: (type) => { set({ sessionType: type }); persist(get()); },
    setWorktreeKey: (key) => { set({ worktreeKey: key }); persist(get()); },
    setCredentialId: (id) => { set({ selectedCredentialId: id }); persist(get()); },
}));
