import type { Session } from './storageTypes';

type SnapshotSession = Omit<Session, 'presence'> & { presence?: 'online' | number };

type SessionSnapshotInput = {
    rawSessionIds: string[];
    decryptedSessions: SnapshotSession[];
    existingSessions: Record<string, Session>;
    existingSessionIdsAtStart?: string[];
};

function mergeWithNewerLocalState(existing: Session | undefined, incoming: SnapshotSession): SnapshotSession {
    if (!existing) return incoming;

    const keepExistingMetadata = existing.metadataVersion > incoming.metadataVersion;
    const keepExistingAgentState = existing.agentStateVersion > incoming.agentStateVersion;
    const keepExistingActivity = existing.activeAt > incoming.activeAt;
    const existingThinkingAt = existing.thinkingAt ?? 0;
    const incomingThinkingAt = incoming.thinkingAt ?? 0;

    return {
        ...incoming,
        seq: Math.max(existing.seq, incoming.seq),
        updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
        ...(keepExistingMetadata ? { metadata: existing.metadata, metadataVersion: existing.metadataVersion } : {}),
        ...(keepExistingAgentState ? { agentState: existing.agentState, agentStateVersion: existing.agentStateVersion } : {}),
        ...(keepExistingActivity ? { active: existing.active, activeAt: existing.activeAt, presence: existing.presence } : {}),
        ...(existingThinkingAt > incomingThinkingAt ? { thinking: existing.thinking, thinkingAt: existing.thinkingAt } : {}),
    };
}

/** Reconcile a full snapshot without interpreting transport/decryption failures as deletes. */
export function reconcileSessionSnapshot(input: SessionSnapshotInput): SnapshotSession[] {
    if (input.rawSessionIds.length === 0 && Object.keys(input.existingSessions).length > 0) {
        return Object.values(input.existingSessions);
    }

    const decryptedById = new Map(input.decryptedSessions.map((session) => [session.id, session]));
    const reconciled: SnapshotSession[] = [];
    for (const sessionId of input.rawSessionIds) {
        const decrypted = decryptedById.get(sessionId);
        if (decrypted) {
            reconciled.push(mergeWithNewerLocalState(input.existingSessions[sessionId], decrypted));
        } else if (input.existingSessions[sessionId]) {
            reconciled.push(input.existingSessions[sessionId]);
        }
    }

    const idsAtStart = new Set(input.existingSessionIdsAtStart ?? Object.keys(input.existingSessions));
    for (const existing of Object.values(input.existingSessions)) {
        if (!idsAtStart.has(existing.id) && !decryptedById.has(existing.id)) {
            reconciled.push(existing);
        }
    }
    return reconciled;
}
