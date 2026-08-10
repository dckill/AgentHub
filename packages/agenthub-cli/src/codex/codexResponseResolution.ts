export type PendingCodexRequest = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    method: string;
    epoch: number;
};

export function settleCodexResponse({
    pending,
    id,
    sourceEpoch,
    result,
    error,
}: {
    pending: Map<number, PendingCodexRequest>;
    id: number;
    sourceEpoch: number;
    result?: unknown;
    error?: { message?: unknown; code?: unknown } | null;
}): 'missing' | 'stale' | 'settled' {
    const request = pending.get(id);
    if (!request) {
        return 'missing';
    }
    if (request.epoch !== sourceEpoch) {
        return 'stale';
    }

    pending.delete(id);
    if (error) {
        request.reject(new Error(`${request.method}: ${String(error.message)} (code=${String(error.code)})`));
    } else {
        request.resolve(result);
    }
    return 'settled';
}
