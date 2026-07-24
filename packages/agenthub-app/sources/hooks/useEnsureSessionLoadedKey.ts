export function getEnsureSessionLoadKey(
    sessionId: string | null | undefined,
    hasSession: boolean,
    credentialToken: string | null,
): string | null {
    if (!sessionId || hasSession) {
        return null;
    }
    return `${sessionId}:${credentialToken ?? 'no-credentials'}`;
}
