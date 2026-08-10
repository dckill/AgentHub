export type MessagePageBounds = {
    minSeq: number | null;
    maxSeq: number | null;
};

/** Returns sequence bounds without depending on page ordering or pagination direction. */
export function getMessagePageBounds(messages: ReadonlyArray<{ seq: number }>): MessagePageBounds {
    let minSeq: number | null = null;
    let maxSeq: number | null = null;

    for (const message of messages) {
        minSeq = minSeq === null ? message.seq : Math.min(minSeq, message.seq);
        maxSeq = maxSeq === null ? message.seq : Math.max(maxSeq, message.seq);
    }

    return { minSeq, maxSeq };
}
