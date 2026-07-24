export type FilePreviewCacheEntry = {
    content: string | null;
    diff: string | null;
    isBinary: boolean;
    totalSize?: number;
    truncated?: boolean;
    cachedAt: number;
    version?: string;
};

export type FilePreviewCache = Record<string, Record<string, FilePreviewCacheEntry>>;

export const FILE_PREVIEW_CACHE_MAX_ENTRIES = 128;
export const FILE_PREVIEW_CACHE_MAX_BYTES = 16 * 1024 * 1024;
export const FILE_PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000;

const ENTRY_OVERHEAD_BYTES = 256;

export function estimateFilePreviewCacheEntryBytes(entry: FilePreviewCacheEntry): number {
    return ENTRY_OVERHEAD_BYTES
        + (entry.content?.length ?? 0) * 2
        + (entry.diff?.length ?? 0) * 2;
}

export function isFilePreviewCacheEntryFresh(
    entry: FilePreviewCacheEntry | null | undefined,
    now: number,
    options: { ttlMs?: number; version?: string } = {},
): entry is FilePreviewCacheEntry {
    if (!entry) return false;
    const ttlMs = options.ttlMs ?? FILE_PREVIEW_CACHE_TTL_MS;
    if (now - entry.cachedAt > ttlMs) return false;
    return options.version === undefined || entry.version === options.version;
}

export function touchFilePreviewCache(
    cache: FilePreviewCache,
    sessionId: string,
    filePath: string,
    cachedAt: number,
): FilePreviewCache {
    const existing = cache[sessionId]?.[filePath];
    if (!existing || existing.cachedAt >= cachedAt) return cache;
    return {
        ...cache,
        [sessionId]: {
            ...cache[sessionId],
            [filePath]: { ...existing, cachedAt },
        },
    };
}

export function applyBoundedFilePreviewCache(
    cache: FilePreviewCache,
    sessionId: string,
    filePath: string,
    entry: FilePreviewCacheEntry,
    budget: { maxEntries: number; maxBytes: number } = {
        maxEntries: FILE_PREVIEW_CACHE_MAX_ENTRIES,
        maxBytes: FILE_PREVIEW_CACHE_MAX_BYTES,
    },
): FilePreviewCache {
    const next: FilePreviewCache = {
        ...cache,
        [sessionId]: { ...(cache[sessionId] ?? {}), [filePath]: entry },
    };
    const indexed = Object.entries(next).flatMap(([entrySessionId, sessionCache]) => (
        Object.entries(sessionCache).map(([entryFilePath, value]) => ({
            sessionId: entrySessionId,
            filePath: entryFilePath,
            value,
            bytes: estimateFilePreviewCacheEntryBytes(value),
        }))
    )).sort((left, right) => left.value.cachedAt - right.value.cachedAt);
    let totalBytes = indexed.reduce((sum, value) => sum + value.bytes, 0);
    let totalEntries = indexed.length;

    for (const candidate of indexed) {
        if (totalEntries <= budget.maxEntries && totalBytes <= budget.maxBytes) break;
        const sessionCache = next[candidate.sessionId];
        if (!sessionCache?.[candidate.filePath]) continue;
        const { [candidate.filePath]: _removed, ...remaining } = sessionCache;
        if (Object.keys(remaining).length === 0) delete next[candidate.sessionId];
        else next[candidate.sessionId] = remaining;
        totalEntries -= 1;
        totalBytes -= candidate.bytes;
    }

    return next;
}
