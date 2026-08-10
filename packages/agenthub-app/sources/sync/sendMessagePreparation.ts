import type { SendControlState } from './sendControlLifecycle';

export type SendMessagePreparationResult<Control, EncryptionContext, Session> =
    | { kind: 'control-denied' }
    | { kind: 'missing-encryption'; failedAttachments: number }
    | { kind: 'missing-session'; failedAttachments: number }
    | { kind: 'ready'; control: Control; encryption: EncryptionContext; session: Session };

export type PrepareSendMessageParams<Control extends SendControlState, EncryptionContext, Session> = {
    initialControl: Control;
    ensureControl: (control: Control) => Promise<Control>;
    getEncryption: () => EncryptionContext | null;
    getSession: () => Session | undefined;
    initialFailureCount: number;
    onControlError?: (error: unknown) => void;
    isCurrent?: () => boolean;
};

/** Resolve control ownership and local send prerequisites before mutating the outbox. */
export async function prepareSendMessage<Control extends SendControlState, EncryptionContext, Session>(
    params: PrepareSendMessageParams<Control, EncryptionContext, Session>,
): Promise<SendMessagePreparationResult<Control, EncryptionContext, Session>> {
    const isCurrent = params.isCurrent ?? (() => true);
    if (!isCurrent()) {
        return { kind: 'control-denied' };
    }
    let control = params.initialControl;
    if (control.mode === 'unknown' || control.mode === 'unclaimed') {
        try {
            control = await params.ensureControl(control);
        } catch (error) {
            params.onControlError?.(error);
            return { kind: 'control-denied' };
        }
    }

    if (!isCurrent()) {
        return { kind: 'control-denied' };
    }

    if (control.mode === 'observer' || control.mode === 'unclaimed') {
        return { kind: 'control-denied' };
    }

    const encryption = params.getEncryption();
    if (!encryption) {
        return { kind: 'missing-encryption', failedAttachments: params.initialFailureCount };
    }

    const session = params.getSession();
    if (!session) {
        return { kind: 'missing-session', failedAttachments: params.initialFailureCount };
    }

    return { kind: 'ready', control, encryption, session };
}
