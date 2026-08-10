import type { SessionEncryption } from './encryption/sessionEncryption';
import type { ApiUpdateContainer } from './apiTypes';
import type { Session } from './storageTypes';
import type { NormalizedMessage } from './typesRaw';
import { applyNewMessageRealtimeUpdate } from './newMessageRealtimeApplication';
import { planNewMessageRealtimeEffects } from './newMessageRealtimeEffects';

type NewMessageUpdate = Extract<ApiUpdateContainer['body'], { t: 'new-message' }>;

export type NewMessageRealtimeHandlerParams = {
    update: NewMessageUpdate;
    seq: number;
    createdAt: number;
    session: Session | undefined;
    encryption: Pick<SessionEncryption, 'decryptMessage'> | null;
    currentLastSeq?: number;
    refreshMissingSession: (sessionId: string) => void;
    invalidateMessages: () => void;
    applySession: (session: Session) => void;
    enqueueMessage: (message: NormalizedMessage) => void;
    setLastSeq: (seq: number) => void;
    isMutableToolCall: (toolUseId: string) => boolean;
    invalidateGitStatus: (sessionId: string) => void;
    assertCurrent: () => void;
    onDecryptError: (error: unknown, sessionId: string) => void;
    onEmptyDecryption?: (sessionId: string) => void;
    onUnreadMessage?: () => void;
};

/**
 * Apply one realtime new-message update while keeping Sync responsible only
 * for its stores and lifecycle callbacks. Missing resources and crypto misses
 * always schedule an authoritative refresh instead of silently dropping data.
 */
export async function handleNewMessageRealtimeUpdate(
    params: NewMessageRealtimeHandlerParams,
): Promise<void> {
    const sessionId = params.update.sid;
    if (!params.session || !params.encryption) {
        params.refreshMissingSession(sessionId);
        return;
    }

    if (!params.update.message) {
        return;
    }

    const result = await applyNewMessageRealtimeUpdate({
        message: params.update.message,
        decrypt: (message) => params.encryption!.decryptMessage(message),
        assertCurrent: params.assertCurrent,
        currentLastSeq: params.currentLastSeq,
    });

    if (result.kind === 'failed') {
        params.onDecryptError(result.error, sessionId);
        params.invalidateMessages();
        return;
    }
    if (result.kind === 'empty') {
        params.onEmptyDecryption?.(sessionId);
        params.invalidateMessages();
        return;
    }

    const effects = planNewMessageRealtimeEffects({
        session: params.session,
        update: { seq: params.seq, createdAt: params.createdAt },
        lifecycleThinkingState: result.lifecycleThinkingState,
        decision: result.decision,
        message: result.normalized,
    });

    if (effects.session) {
        params.applySession(effects.session);
    } else {
        params.refreshMissingSession(sessionId);
    }

    if (effects.delivery === 'enqueue' && effects.message) {
        params.enqueueMessage(effects.message);
        params.onUnreadMessage?.();
        params.setLastSeq(params.update.message.seq);
        const content = effects.message.role === 'agent' && Array.isArray(effects.message.content)
            ? effects.message.content[0]
            : null;
        if (
            effects.message.role === 'agent' &&
            content?.type === 'tool-result' &&
            params.isMutableToolCall(content.tool_use_id)
        ) {
            params.invalidateGitStatus(sessionId);
        }
    } else if (effects.delivery === 'refresh') {
        params.invalidateMessages();
    }
}
