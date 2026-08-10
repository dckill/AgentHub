/** Keep a bounded insertion-ordered set, refreshing duplicate recency. */
export function rememberBoundedTurnId(
    ids: Set<string>,
    turnId: string,
    maxSize: number,
): void {
    ids.delete(turnId);
    ids.add(turnId);
    while (ids.size > Math.max(0, maxSize)) {
        const oldest = ids.values().next().value;
        if (typeof oldest !== 'string') {
            break;
        }
        ids.delete(oldest);
    }
}
