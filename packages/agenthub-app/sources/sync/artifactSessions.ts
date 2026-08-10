export function areArtifactSessionsEqual(
    current: string[] | undefined,
    incoming: string[] | undefined,
): boolean {
    if (current === incoming) {
        return true;
    }
    if (!current || !incoming || current.length !== incoming.length) {
        return false;
    }
    return current.every((sessionId, index) => sessionId === incoming[index]);
}
