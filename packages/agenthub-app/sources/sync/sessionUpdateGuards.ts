type MissingSessionUpdateType = 'new-message' | 'update-session';

type MissingSessionLogger = {
    error: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
};

export function handleMissingSessionForUpdate({
    hasEncryption,
    hasSession,
    fetchSessions,
}: {
    sessionId: string;
    updateType: MissingSessionUpdateType;
    hasSession: boolean;
    hasEncryption: boolean;
    fetchSessions: () => void;
    logger?: MissingSessionLogger;
}): boolean {
    if (hasSession && hasEncryption) {
        return false;
    }

    fetchSessions();
    return true;
}

export function shouldRefreshMessagesForControlHandoff(input: {
    previousControlledByUser: boolean | null | undefined;
    nextControlledByUser: boolean | null | undefined;
}): boolean {
    if (typeof input.previousControlledByUser !== 'boolean' || typeof input.nextControlledByUser !== 'boolean') {
        return false;
    }

    return input.previousControlledByUser !== input.nextControlledByUser;
}
