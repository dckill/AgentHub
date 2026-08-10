export type SessionDeleteCleanup = {
    clearGitStatus: (sessionId: string) => void;
    deleteMessagesSync: (sessionId: string) => void;
    deleteSendSync: (sessionId: string) => void;
    deleteOlderMessagesSync: (sessionId: string) => void;
    clearOlderMessagesRetryGuard: (sessionId: string) => void;
    deletePendingOutbox: (sessionId: string) => void;
    clearMessagePagination: (sessionId: string) => void;
    clearMessageIngest: (sessionId: string) => void;
};

/** Clear all in-memory resources owned by a deleted session. */
export function cleanupDeletedSession(sessionId: string, cleanup: SessionDeleteCleanup): void {
    cleanup.clearGitStatus(sessionId);
    cleanup.deleteMessagesSync(sessionId);
    cleanup.deleteSendSync(sessionId);
    cleanup.deleteOlderMessagesSync(sessionId);
    cleanup.clearOlderMessagesRetryGuard(sessionId);
    cleanup.deletePendingOutbox(sessionId);
    cleanup.clearMessagePagination(sessionId);
    cleanup.clearMessageIngest(sessionId);
}
