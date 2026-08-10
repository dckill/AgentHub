export interface MessageFetchProgressInput {
    hasMore: boolean;
    previousSeq: number;
    nextSeq: number;
}

export interface MessageFetchProgress {
    continue: boolean;
    afterSeq: number;
}

/** Keeps catch-up pagination finite when a server page makes no seq progress. */
export function getMessageFetchProgress(input: MessageFetchProgressInput): MessageFetchProgress {
    return {
        continue: input.hasMore && input.nextSeq > input.previousSeq,
        afterSeq: input.nextSeq,
    };
}
