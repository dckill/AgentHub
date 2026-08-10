export type SessionDeleteApplicationActions = {
    deleteSession: (sessionId: string) => void;
    removeSessionEncryption: (sessionId: string) => void;
    removeProjectSession: (sessionId: string) => void;
    cleanupResources: (sessionId: string) => void;
};

/** Apply the complete local deletion sequence for a realtime delete-session update. */
export function applySessionDelete(
    sessionId: string,
    actions: SessionDeleteApplicationActions,
): void {
    actions.deleteSession(sessionId);
    actions.removeSessionEncryption(sessionId);
    actions.removeProjectSession(sessionId);
    actions.cleanupResources(sessionId);
}
