export function runSessionVisibility<T>({
    sessionId,
    clearMessageError,
    invalidateMessages,
    invalidateGitStatus,
    loadSessionControl,
    applySessionControl,
    isCurrent,
    warn,
}: {
    sessionId: string;
    clearMessageError: (sessionId: string) => void;
    invalidateMessages: (sessionId: string) => void;
    invalidateGitStatus: (sessionId: string) => void;
    loadSessionControl: (sessionId: string) => Promise<T>;
    applySessionControl: (control: T) => void;
    isCurrent: () => boolean;
    warn: (message: string, error: unknown) => void;
}): void {
    clearMessageError(sessionId);
    invalidateMessages(sessionId);
    invalidateGitStatus(sessionId);

    void loadSessionControl(sessionId)
        .then((control) => {
            if (isCurrent()) {
                applySessionControl(control);
            }
        })
        .catch((error) => warn('Failed to load session control:', error));
}

export function retrySessionMessages({
    sessionId,
    clearMessageError,
    invalidateMessages,
}: {
    sessionId: string;
    clearMessageError: (sessionId: string) => void;
    invalidateMessages: (sessionId: string) => void;
}): void {
    clearMessageError(sessionId);
    invalidateMessages(sessionId);
}
