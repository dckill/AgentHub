type CursorPage<T> = {
    items: T[];
    nextCursor: string | null;
    hasNext: boolean;
};

export async function fetchCompleteCursorSnapshot<T>(
    fetchPage: (cursor: string | null) => Promise<CursorPage<T>>,
): Promise<T[]> {
    const items: T[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    do {
        const page = await fetchPage(cursor);
        items.push(...page.items);
        const nextCursor = page.hasNext ? page.nextCursor : null;
        if (page.hasNext && !nextCursor) {
            throw new Error('Cursor page says more data exists but did not provide a cursor');
        }
        if (nextCursor && seenCursors.has(nextCursor)) {
            throw new Error('Cursor pagination returned a repeated cursor');
        }
        if (nextCursor) seenCursors.add(nextCursor);
        cursor = nextCursor;
    } while (cursor);

    return items;
}
