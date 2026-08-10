export interface LatestMessagesPageInput {
    currentFirstSeq: number | undefined;
    currentLastSeq: number | undefined;
    processedMinSeq: number | null;
    processedMaxSeq: number | null;
    hasMore: boolean;
}

export interface LatestMessagesPageResult {
    firstSeq: number | undefined;
    lastSeq: number | undefined;
    hasMoreBefore: boolean;
    isLoadingBefore: false;
}

/** Apply the cursor/state transition for the initial latest-message page. */
export function applyLatestMessagesPage(input: LatestMessagesPageInput): LatestMessagesPageResult {
    return {
        firstSeq: input.processedMinSeq ?? input.currentFirstSeq,
        lastSeq: input.processedMaxSeq ?? input.currentLastSeq,
        hasMoreBefore: input.hasMore,
        isLoadingBefore: false,
    };
}

export interface CatchupMessagesChunkInput {
    currentFirstSeq: number | undefined;
    currentLastSeq: number | undefined;
    processedMinSeq: number | null;
    processedMaxSeq: number | null;
}

export interface CatchupMessagesChunkResult {
    firstSeq: number | undefined;
    lastSeq: number | undefined;
}

/** Apply a catch-up chunk without allowing the oldest cursor to regress. */
export function applyCatchupMessagesChunk(input: CatchupMessagesChunkInput): CatchupMessagesChunkResult {
    return {
        firstSeq: input.processedMinSeq === null
            ? input.currentFirstSeq
            : input.currentFirstSeq === undefined
                ? input.processedMinSeq
                : Math.min(input.currentFirstSeq, input.processedMinSeq),
        lastSeq: input.processedMaxSeq === null
            ? input.currentLastSeq
            : input.processedMaxSeq,
    };
}
