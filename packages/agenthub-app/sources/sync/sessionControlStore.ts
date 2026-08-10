import { create } from 'zustand';
import type { SessionControlState } from '@artsum/agenthub-wire';
import { getOrCreateDeviceId } from './deviceIdentity';

export type SessionControlMode = 'unknown' | 'unclaimed' | 'controller' | 'observer';

export interface SessionControlView extends SessionControlState {
    mode: SessionControlMode;
}

interface SessionControlStore {
    deviceId: string;
    sessions: Record<string, SessionControlView>;
    apply: (state: SessionControlState) => void;
    clear: () => void;
    get: (sessionId: string) => SessionControlView;
}

function resolveMode(state: SessionControlState, deviceId: string): SessionControlMode {
    if (!state.activeDeviceId) return 'unclaimed';
    return state.activeDeviceId === deviceId ? 'controller' : 'observer';
}

const unknownState = (sessionId: string): SessionControlView => ({
    sessionId,
    activeDeviceId: null,
    activeDeviceAt: null,
    mode: 'unknown',
});

export const useSessionControlStore = create<SessionControlStore>((set, get) => ({
    deviceId: getOrCreateDeviceId(),
    sessions: {},
    apply: (state) => set((current) => ({
        sessions: {
            ...current.sessions,
            [state.sessionId]: { ...state, mode: resolveMode(state, current.deviceId) },
        },
    })),
    clear: () => set({ sessions: {} }),
    get: (sessionId) => get().sessions[sessionId] ?? unknownState(sessionId),
}));

export const sessionControlStore = useSessionControlStore;
