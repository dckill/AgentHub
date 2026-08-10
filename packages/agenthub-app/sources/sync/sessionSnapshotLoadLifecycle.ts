import type { AccountRequest } from './accountLifecycle';

type SessionEnvelope<TRecord> = {
    session?: TRecord;
} | {
    missing?: boolean;
};

export type SessionSnapshotLoadOptions<TRecord, TResult> = {
    runRequest: (
        operation: (request: AccountRequest) => Promise<TResult | null>,
    ) => Promise<TResult | null>;
    fetch: (signal: AbortSignal) => Promise<{
        status: number;
        data: SessionEnvelope<TRecord>;
    }>;
    decrypt: (record: TRecord, request: AccountRequest) => Promise<TResult | null> | TResult | null;
};

/** Bind a single-session fetch, account freshness gate, and snapshot decryption. */
export function loadSessionSnapshot<TRecord, TResult>(
    options: SessionSnapshotLoadOptions<TRecord, TResult>,
): Promise<TResult | null> {
    return options.runRequest(async (request) => {
        const response = await options.fetch(request.signal);
        if (response.status === 404) {
            return null;
        }

        request.assertCurrent();
        const record = 'session' in response.data ? response.data.session : undefined;
        if (!record) {
            return null;
        }

        return options.decrypt(record, request);
    });
}
