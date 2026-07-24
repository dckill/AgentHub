import type { SessionEnvelope } from '@artsum/agenthub-wire';

import type { Thread } from './codexAppServerTypes';
import { mapCodexThreadToSessionEnvelopes } from './utils/sessionProtocolMapper';

type OfficialThreadSyncClient = {
    readThread: (opts: { threadId: string; includeTurns?: boolean }) => Promise<{ thread: Thread }>;
};

type OfficialThreadSyncSession = {
    sendSessionProtocolMessage: (envelope: SessionEnvelope) => void;
    updateMetadata: (handler: (currentMetadata: any) => any) => void;
};

function normalizeTitle(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

function basename(path: string | null | undefined): string | null {
    const normalized = normalizeTitle(path);
    if (!normalized) {
        return null;
    }

    const parts = normalized.split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] ?? null;
}

function isProjectNameTitle(title: string, cwd: unknown): boolean {
    return normalizeTitle(cwd) !== null && title === basename(String(cwd));
}

function textFromUserMessageItem(item: unknown): string | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
    }

    const record = item as Record<string, unknown>;
    if (record.type !== 'userMessage') {
        return null;
    }

    const content = record.content;
    if (typeof content === 'string') {
        return normalizeTitle(content);
    }
    if (!Array.isArray(content)) {
        return null;
    }

    const parts = content
        .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                return null;
            }
            const text = (entry as Record<string, unknown>).text;
            return typeof text === 'string' ? text : null;
        })
        .filter((text): text is string => !!text);

    return normalizeTitle(parts.join(' '));
}

function latestUserMessageTitle(thread: Pick<Thread, 'turns'>): string | null {
    for (const turn of [...(thread.turns ?? [])].reverse()) {
        for (const item of [...(turn.items ?? [])].reverse()) {
            const title = textFromUserMessageItem(item);
            if (title) {
                return title;
            }
        }
    }

    return null;
}

export function pickThreadTitle(thread: Thread): string | null {
    const title = normalizeTitle(thread.title);
    if (title && !isProjectNameTitle(title, thread.cwd)) {
        return title;
    }

    return latestUserMessageTitle(thread) ?? title;
}

function completedTurnIds(thread: Pick<Thread, 'turns'>): Set<string> {
    const ids = new Set<string>();
    for (const turn of thread.turns ?? []) {
        if (turn.completedAt !== undefined && turn.completedAt !== null) {
            ids.add(turn.id);
            continue;
        }

        const status = typeof turn.status === 'string' ? turn.status : null;
        if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'aborted' || status === 'interrupted') {
            ids.add(turn.id);
        }
    }
    return ids;
}

export function metadataWithCodexThreadTitle(metadata: any, threadId: string, title: string): any {
    if (metadata?.summary?.text === title) {
        return {
            ...metadata,
            codexThreadId: threadId,
        };
    }

    return {
        ...metadata,
        codexThreadId: threadId,
        summary: {
            ...(metadata?.summary && typeof metadata.summary === 'object' ? metadata.summary : {}),
            text: title,
            updatedAt: Date.now(),
        },
    };
}

export async function readOfficialCodexThreadTitle(
    client: OfficialThreadSyncClient,
    threadId: string,
): Promise<string | null> {
    const { thread } = await client.readThread({ threadId, includeTurns: true });
    return pickThreadTitle(thread);
}

export function applyOfficialCodexThreadTitle(
    session: Pick<OfficialThreadSyncSession, 'updateMetadata'>,
    threadId: string,
    title: string | null,
): void {
    if (!title) {
        return;
    }

    session.updateMetadata((currentMetadata) => metadataWithCodexThreadTitle(currentMetadata, threadId, title));
}

export function createOfficialCodexThreadSync(opts: {
    client: OfficialThreadSyncClient;
    session: OfficialThreadSyncSession;
    threadId: string;
    seenEnvelopeIds?: Iterable<string>;
    seenEnvelopes?: Iterable<SessionEnvelope>;
}) {
    const seenEnvelopeIds = new Set<string>();
    const unmatchedTextFingerprints = new Map<string, number>();
    let lastTitle: string | null = null;
    let pollInFlight: Promise<void> | null = null;

    const textFingerprint = (envelope: SessionEnvelope): string | null => {
        if (envelope.ev.t !== 'text') {
            return null;
        }
        return JSON.stringify([
            envelope.role,
            envelope.ev.thinking === true,
            envelope.ev.text.trim(),
        ]);
    };

    const rememberEnvelope = (envelope: SessionEnvelope) => {
        if (seenEnvelopeIds.has(envelope.id)) {
            return;
        }
        seenEnvelopeIds.add(envelope.id);
        const fingerprint = textFingerprint(envelope);
        if (fingerprint) {
            unmatchedTextFingerprints.set(fingerprint, (unmatchedTextFingerprints.get(fingerprint) ?? 0) + 1);
        }
    };

    for (const envelope of opts.seenEnvelopes ?? []) {
        rememberEnvelope(envelope);
    }
    for (const envelopeId of opts.seenEnvelopeIds ?? []) {
        seenEnvelopeIds.add(envelopeId);
    }

    const poll = async () => {
        if (pollInFlight) {
            return pollInFlight;
        }

        pollInFlight = (async () => {
            const { thread } = await opts.client.readThread({
                threadId: opts.threadId,
                includeTurns: true,
            });

            const title = pickThreadTitle(thread);
            if (title && title !== lastTitle) {
                lastTitle = title;
                applyOfficialCodexThreadTitle(opts.session, opts.threadId, title);
            }

            const closedTurns = completedTurnIds(thread);
            const envelopes = mapCodexThreadToSessionEnvelopes(thread);
            for (const envelope of envelopes) {
                if (envelope.ev.t === 'turn-end' && envelope.turn && !closedTurns.has(envelope.turn)) {
                    continue;
                }
                if (seenEnvelopeIds.has(envelope.id)) {
                    continue;
                }
                const fingerprint = textFingerprint(envelope);
                const remainingMatches = fingerprint ? (unmatchedTextFingerprints.get(fingerprint) ?? 0) : 0;
                if (fingerprint && remainingMatches > 0) {
                    if (remainingMatches === 1) {
                        unmatchedTextFingerprints.delete(fingerprint);
                    } else {
                        unmatchedTextFingerprints.set(fingerprint, remainingMatches - 1);
                    }
                    seenEnvelopeIds.add(envelope.id);
                    continue;
                }
                seenEnvelopeIds.add(envelope.id);
                opts.session.sendSessionProtocolMessage(envelope);
            }
        })();

        try {
            await pollInFlight;
        } finally {
            pollInFlight = null;
        }
    };

    return {
        poll,
        rememberEnvelope,
    };
}
