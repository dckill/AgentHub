import type { Session } from './storageTypes';

type SessionEnvelope = {
    id: string;
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
    [key: string]: unknown;
};

type ResolvedThinkingState = Pick<Session, 'thinking' | 'thinkingAt'>;

/** Combine decrypted session payload with the server envelope and resolved local activity state. */
export function buildDecryptedSessionProjection(
    session: SessionEnvelope,
    metadata: Session['metadata'],
    agentState: Session['agentState'],
    thinkingState: ResolvedThinkingState,
): Omit<Session, 'presence'> & { presence?: Session['presence'] } {
    return {
        ...session,
        thinking: thinkingState.thinking,
        thinkingAt: thinkingState.thinkingAt,
        metadata,
        agentState,
    } as Omit<Session, 'presence'> & { presence?: Session['presence'] };
}
