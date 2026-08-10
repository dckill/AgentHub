export type MessageFetchMode = 'latest' | 'catchup';

export interface MessageFetchModeInput {
    afterSeq: number | undefined;
    hasLocalMessages: boolean;
}

/** Selects the initial latest-page load versus incremental message catch-up. */
export function getMessageFetchMode(input: MessageFetchModeInput): MessageFetchMode {
    const afterSeq = input.afterSeq ?? 0;
    return afterSeq === 0 && !input.hasLocalMessages ? 'latest' : 'catchup';
}
