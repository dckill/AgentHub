import type { ApiMessage } from './apiTypes';
import type { AccountRequest } from './accountLifecycle';
import type { Session } from './storageTypes';
import type { SessionEncryption } from './encryption/sessionEncryption';
import { resolveSessionThinkingState } from '@/utils/sessionActivity';
import { buildDecryptedSessionProjection } from './sessionDecryptionProjection';
import { reconcileSessionSnapshot } from './sessionSnapshot';

export type SessionSnapshotRecord = {
    id: string;
    tag?: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    agentState: string | null;
    agentStateVersion: number;
    dataEncryptionKey: string | null;
    active: boolean;
    activeAt: number;
    thinking?: boolean;
    thinkingAt?: number | null;
    createdAt: number;
    updatedAt: number;
    lastMessage?: ApiMessage | null;
};

type SessionSnapshotEncryption = {
    decryptEncryptionKey: (encrypted: string) => Promise<Uint8Array | null>;
    initializeSessions: (sessions: Map<string, Uint8Array | null>) => Promise<void>;
    getSessionEncryption: (sessionId: string) => Pick<SessionEncryption, 'decryptMetadata' | 'decryptAgentState'> | null;
};

type ExistingSessionState = Pick<Session, 'active' | 'thinking' | 'thinkingAt'>;

export async function decryptSessionSnapshot(params: {
    sessions: SessionSnapshotRecord[];
    existingSessions: Record<string, ExistingSessionState | undefined>;
    encryption: SessionSnapshotEncryption;
    request: AccountRequest;
}): Promise<Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>> {
    const { sessions, existingSessions, encryption, request } = params;
    request.assertCurrent();

    const sessionKeys = new Map<string, Uint8Array | null>();
    for (const session of sessions) {
        if (session.dataEncryptionKey) {
            const decrypted = await encryption.decryptEncryptionKey(session.dataEncryptionKey);
            request.assertCurrent();
            if (!decrypted) {
                console.error(`Failed to decrypt data encryption key for session ${session.id}`);
                continue;
            }
            sessionKeys.set(session.id, decrypted);
        } else {
            sessionKeys.set(session.id, null);
        }
    }

    await encryption.initializeSessions(sessionKeys);
    request.assertCurrent();

    const decryptedSessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }> = [];
    for (const session of sessions) {
        const sessionEncryption = encryption.getSessionEncryption(session.id);
        if (!sessionEncryption) {
            console.error(`Session encryption not found for ${session.id} - this should never happen`);
            continue;
        }

        const metadata = await sessionEncryption.decryptMetadata(session.metadataVersion, session.metadata);
        const agentState = await sessionEncryption.decryptAgentState(session.agentStateVersion, session.agentState);
        request.assertCurrent();

        const thinkingState = resolveSessionThinkingState(existingSessions[session.id], {
            active: session.active,
            activeAt: session.activeAt,
            thinking: session.thinking,
            thinkingAt: session.thinkingAt,
        });

        decryptedSessions.push(buildDecryptedSessionProjection(session, metadata, agentState, thinkingState));
    }

    return decryptedSessions;
}

type SnapshotSession = Omit<Session, 'presence'> & { presence?: Session['presence'] };

export type SessionSnapshotApplicationResult = {
    reconciledSessions: SnapshotSession[];
    shouldRetry: boolean;
    ignoredEmptySnapshot: boolean;
};

/** Apply a decrypted snapshot without turning transport/key failures into deletes. */
export function applySessionSnapshot(params: {
    rawSessionIds: string[];
    decryptedSessions: SnapshotSession[];
    existingSessions: Record<string, Session>;
    existingSessionIdsAtStart?: string[];
}): SessionSnapshotApplicationResult {
    const existingCount = Object.keys(params.existingSessions).length;
    return {
        reconciledSessions: reconcileSessionSnapshot(params),
        shouldRetry: params.rawSessionIds.length > params.decryptedSessions.length,
        ignoredEmptySnapshot: params.rawSessionIds.length === 0 && existingCount > 0,
    };
}
