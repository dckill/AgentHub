export type SendControlMode = 'unknown' | 'unclaimed' | 'controller' | 'observer';

export type SendControlState = {
    mode: SendControlMode;
};

export type EnsureSendControlParams<Current extends SendControlState, RemoteState> = {
    initial: Current;
    getCurrent: () => Current;
    getRemoteState: () => Promise<RemoteState>;
    claimRemote: () => Promise<RemoteState>;
    apply: (state: RemoteState) => void;
    isCurrent?: () => boolean;
};

/**
 * Resolve the session-control state required before a user message is queued.
 * Network and store effects are injected so the send method keeps ownership
 * of account/session dependencies while this lifecycle remains testable.
 */
export async function ensureSendControl<Current extends SendControlState, RemoteState>(
    params: EnsureSendControlParams<Current, RemoteState>,
): Promise<Current> {
    let control = params.initial;
    const isCurrent = params.isCurrent ?? (() => true);
    if (!isCurrent()) return control;
    if (control.mode !== 'unknown' && control.mode !== 'unclaimed') {
        return control;
    }

    if (control.mode === 'unknown') {
        const remoteState = await params.getRemoteState();
        if (!isCurrent()) return control;
        params.apply(remoteState);
        control = params.getCurrent();
    }
    if (control.mode === 'unclaimed') {
        const remoteState = await params.claimRemote();
        if (!isCurrent()) return control;
        params.apply(remoteState);
        control = params.getCurrent();
    }
    return control;
}
