import type { ArtifactHeader } from './artifactTypes';

/** Normalize decrypted artifact header data at the storage boundary. */
export function normalizeArtifactHeader(value: unknown): ArtifactHeader | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Record<string, unknown>;
    const header: ArtifactHeader = {
        title: typeof raw.title === 'string' ? raw.title : null,
    };

    if (Array.isArray(raw.sessions) && raw.sessions.every((sessionId) => typeof sessionId === 'string')) {
        header.sessions = raw.sessions;
    }
    if (typeof raw.draft === 'boolean') {
        header.draft = raw.draft;
    }

    return header;
}
