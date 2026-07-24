export const OFFICIAL_RESUME_PENDING_TIMEOUT_MS = 15_000;

export function shouldKeepOfficialResumePending(options: {
    startedAt: number;
    now: number;
    messagesLoaded: boolean;
}): boolean {
    if (options.messagesLoaded) {
        return false;
    }

    return options.now - options.startedAt < OFFICIAL_RESUME_PENDING_TIMEOUT_MS;
}
