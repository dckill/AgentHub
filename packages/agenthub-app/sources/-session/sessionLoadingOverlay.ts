export function shouldShowSessionLoadingOverlay(input: {
    isDataReady: boolean;
    isEnsuringSession: boolean;
    hasSession: boolean;
}): boolean {
    if (!input.isDataReady) {
        return true;
    }
    return input.isEnsuringSession && !input.hasSession;
}
