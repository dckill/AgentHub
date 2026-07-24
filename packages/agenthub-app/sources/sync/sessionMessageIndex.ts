import type { Message } from './typesMessage';

export function mergeMessagesNewestFirst<T extends { id: string; createdAt: number }>(
    existingMessages: readonly T[],
    existingMessagesMap: Readonly<Record<string, T>>,
    updates: readonly T[],
): { messages: T[]; messagesMap: Record<string, T> } {
    if (updates.length === 0) {
        return { messages: existingMessages as T[], messagesMap: existingMessagesMap as Record<string, T> };
    }

    // Realtime streams can replay the same object references after an ACK or
    // reconnect. Avoid rebuilding the full ordered list and map when nothing
    // actually changed; this keeps the common duplicate-update path O(batch).
    if (updates.every((message) => existingMessagesMap[message.id] === message)) {
        return { messages: existingMessages as T[], messagesMap: existingMessagesMap as Record<string, T> };
    }

    const updateIds = new Set(updates.map((message) => message.id));
    const unchanged = existingMessages.filter((message) => !updateIds.has(message.id));
    const sortedUpdates = [...new Map(updates.map((message) => [message.id, message])).values()]
        .sort((left, right) => right.createdAt - left.createdAt);
    const messages: T[] = [];
    let existingIndex = 0;
    let updateIndex = 0;
    while (existingIndex < unchanged.length || updateIndex < sortedUpdates.length) {
        const existing = unchanged[existingIndex];
        const update = sortedUpdates[updateIndex];
        if (!update || (existing && existing.createdAt >= update.createdAt)) {
            messages.push(existing);
            existingIndex += 1;
        } else {
            messages.push(update);
            updateIndex += 1;
        }
    }

    // This map is a derived lookup cache. The immutable, ordered `messages`
    // array remains the authoritative UI snapshot, while SessionMessages gets
    // a new wrapper on every committed update. Reusing the cache avoids an
    // O(history) object spread for every live message without changing order
    // or message object snapshots consumed by list selectors.
    const messagesMap = existingMessagesMap as Record<string, T>;
    for (const message of updates) messagesMap[message.id] = message;
    return { messages, messagesMap };
}

export function countRunningToolsInMessages(messages: readonly Message[]): number {
    let running = 0;
    const stack = [...messages];
    while (stack.length > 0) {
        const message = stack.pop();
        if (!message || message.kind !== 'tool-call') continue;
        if (message.tool.state === 'running') running += 1;
        stack.push(...message.children);
    }
    return running;
}

export function updateRunningToolCount(
    existingCount: number,
    existingMessagesMap: Readonly<Record<string, Message>>,
    updates: readonly Message[],
): number {
    if (updates.length === 0) return existingCount;

    let nextCount = existingCount;
    const latestUpdates = updates.length === 1
        ? [[updates[0].id, updates[0]]] as const
        : new Map(updates.map((message) => [message.id, message]));
    for (const [id, message] of latestUpdates) {
        const existing = existingMessagesMap[id];
        if (existing) nextCount -= countRunningToolsInMessages([existing]);
        nextCount += countRunningToolsInMessages([message]);
    }
    return nextCount;
}

export function selectRetainedSessionMessageIds(
    sessions: Readonly<Record<string, { active: boolean; updatedAt: number }>>,
    loadedSessionIds: readonly string[],
    maxInactive: number,
): Set<string> {
    const loaded = new Set(loadedSessionIds);
    const retained = new Set<string>();
    const inactive: Array<{ id: string; updatedAt: number }> = [];
    for (const [id, session] of Object.entries(sessions)) {
        if (!loaded.has(id)) continue;
        if (session.active) retained.add(id);
        else inactive.push({ id, updatedAt: session.updatedAt });
    }
    inactive.sort((left, right) => right.updatedAt - left.updatedAt);
    for (const session of inactive.slice(0, maxInactive)) retained.add(session.id);
    return retained;
}
