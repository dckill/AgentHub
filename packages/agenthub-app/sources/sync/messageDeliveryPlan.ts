export type MessageDeliveryPlan = 'enqueue' | 'refresh';

/** Chooses the incremental or catch-up path for an incoming encrypted message. */
export function getMessageDeliveryPlan(currentLastSeq: number | undefined, incomingSeq: number): MessageDeliveryPlan {
    return currentLastSeq !== undefined && incomingSeq === currentLastSeq + 1
        ? 'enqueue'
        : 'refresh';
}
