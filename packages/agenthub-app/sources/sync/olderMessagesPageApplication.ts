export interface OlderMessagesPageInput {
    currentFirstSeq: number | undefined;
    currentLastSeq: number | undefined;
    processedMinSeq: number | null;
    processedMaxSeq: number | null;
    hasMore: boolean;
}

export interface OlderMessagesPageResult {
    firstSeq: number | undefined;
    lastSeq: number | undefined;
    hasMoreBefore: boolean;
    isLoadingBefore: false;
}

export function applyOlderMessagesPage(input: OlderMessagesPageInput): OlderMessagesPageResult {
    return {
        firstSeq: input.processedMinSeq ?? input.currentFirstSeq,
        lastSeq: input.processedMaxSeq === null
            ? input.currentLastSeq
            : Math.max(input.currentLastSeq ?? 0, input.processedMaxSeq),
        hasMoreBefore: input.hasMore,
        isLoadingBefore: false,
    };
}
