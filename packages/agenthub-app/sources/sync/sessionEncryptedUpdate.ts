import type { ApiUpdate } from './apiTypes';
import type { AgentState, Metadata, Session } from './storageTypes';

type SessionUpdate = Extract<ApiUpdate, { t: 'update-session' }>;

type SessionEncryptionLike = {
    decryptMetadata: (version: number, encrypted: string) => Promise<Metadata | null>;
    decryptAgentState: (version: number, encrypted: string | null | undefined) => Promise<AgentState | null>;
};

type SessionEncryptedUpdateParams = {
    session: Session;
    update: SessionUpdate;
    encryption: SessionEncryptionLike;
    assertCurrent: () => void;
    onError?: (field: 'metadata' | 'agentState', error: unknown) => void;
};

/** Apply encrypted session fields without replacing valid state on decrypt failure. */
export async function applySessionEncryptedUpdate(
    params: SessionEncryptedUpdateParams,
): Promise<Session> {
    const updated: Session = { ...params.session };
    const onError = params.onError ?? (() => undefined);

    if (params.update.metadata) {
        const metadataUpdate = params.update.metadata;
        let metadata: Metadata | null | undefined;
        try {
            metadata = await params.encryption.decryptMetadata(metadataUpdate.version, metadataUpdate.value);
        } catch (error) {
            onError('metadata', error);
            metadata = undefined;
        }
        if (metadata === null) {
            onError('metadata', new Error('Session metadata decryption returned no value'));
        } else if (metadata !== undefined) {
            params.assertCurrent();
            updated.metadata = metadata;
            updated.metadataVersion = metadataUpdate.version;
        }
    }

    if (params.update.agentState) {
        const agentStateUpdate = params.update.agentState;
        let agentState: AgentState | null | undefined;
        try {
            agentState = await params.encryption.decryptAgentState(agentStateUpdate.version, agentStateUpdate.value);
        } catch (error) {
            onError('agentState', error);
            agentState = undefined;
        }
        if (agentState === null) {
            onError('agentState', new Error('Session agent state decryption returned no value'));
        } else if (agentState !== undefined) {
            params.assertCurrent();
            updated.agentState = agentState;
            updated.agentStateVersion = agentStateUpdate.version;
        }
    }

    return updated;
}
