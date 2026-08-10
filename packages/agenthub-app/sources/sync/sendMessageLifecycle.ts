export type SendMessageLifecycleResult = {
    sent: boolean;
    failedAttachments: number;
    controlDenied?: boolean;
};

export type SendMessageLifecyclePreparation<Ready> =
    | { kind: 'ready'; value: Ready }
    | { kind: 'failed'; result: SendMessageLifecycleResult };

export type SendMessageLifecycleParams<Ready> = {
    isCurrent: () => boolean;
    prepare: () => Promise<SendMessageLifecyclePreparation<Ready>>;
    dispatch: (ready: Ready) => Promise<SendMessageLifecycleResult>;
};

/** Keep account-generation gates around the complete send preparation/dispatch chain. */
export async function runSendMessageLifecycle<Ready>({
    isCurrent,
    prepare,
    dispatch,
}: SendMessageLifecycleParams<Ready>): Promise<SendMessageLifecycleResult> {
    if (!isCurrent()) {
        return { sent: false, failedAttachments: 0 };
    }

    const preparation = await prepare();
    if (!isCurrent()) {
        return { sent: false, failedAttachments: 0 };
    }

    if (preparation.kind === 'failed') {
        return preparation.result;
    }

    const result = await dispatch(preparation.value);
    if (!isCurrent()) {
        return { sent: false, failedAttachments: result.failedAttachments };
    }
    return result;
}
