export type PushTicketLike = {
    status?: string;
};

export type PushTicketChunkResult = {
    delivered: boolean;
    shouldRetry: boolean;
    errorCount: number;
};

/** Classify one provider response without treating an empty response as a retryable delivery failure. */
export function classifyPushTicketChunk(tickets: readonly PushTicketLike[]): PushTicketChunkResult {
    const errorCount = tickets.filter((ticket) => ticket.status === 'error').length;
    if (tickets.length === 0) {
        return { delivered: false, shouldRetry: false, errorCount: 0 };
    }

    const delivered = tickets.some((ticket) => ticket.status === 'ok');
    return {
        delivered,
        shouldRetry: !delivered && errorCount === tickets.length,
        errorCount,
    };
}
