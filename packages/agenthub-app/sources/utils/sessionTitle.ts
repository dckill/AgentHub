export type SessionTitleMetadata = {
    summary?: { text?: string | null } | null;
    name?: string | null;
    lastUserMessage?: string | null;
    path?: string | null;
};

function normalizeTitle(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

function getPathBasename(value: unknown): string | null {
    const normalized = normalizeTitle(value);
    if (!normalized) {
        return null;
    }

    const segments = normalized.split(/[\\/]/).filter(Boolean);
    return normalizeTitle(segments[segments.length - 1]);
}

export function resolveSessionDisplayTitle(metadata: SessionTitleMetadata | null | undefined): string | null {
    return normalizeTitle(metadata?.summary?.text)
        ?? normalizeTitle(metadata?.name)
        ?? normalizeTitle(metadata?.lastUserMessage)
        ?? getPathBasename(metadata?.path)
        ?? null;
}
