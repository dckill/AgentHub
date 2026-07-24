import { inTx, type Tx } from '@/storage/inTx';

export type AccountQuotaResource = 'sessions' | 'messages' | 'machines' | 'artifacts' | 'credentials' | 'kv' | 'externalShares';
export type AccountQuotas = Record<AccountQuotaResource, number>;

const defaults: AccountQuotas = {
    sessions: 10_000,
    messages: 1_000_000,
    machines: 1_000,
    artifacts: 1_000,
    credentials: 100,
    kv: 10_000,
    externalShares: 50,
};

const envKeys: Record<AccountQuotaResource, string> = {
    sessions: 'AGENTHUB_QUOTA_SESSIONS',
    messages: 'AGENTHUB_QUOTA_MESSAGES',
    machines: 'AGENTHUB_QUOTA_MACHINES',
    artifacts: 'AGENTHUB_QUOTA_ARTIFACTS',
    credentials: 'AGENTHUB_QUOTA_CREDENTIALS',
    kv: 'AGENTHUB_QUOTA_KV_KEYS',
    externalShares: 'AGENTHUB_QUOTA_EXTERNAL_SHARES',
};

export function readAccountQuotas(env: Record<string, string | undefined> = process.env): AccountQuotas {
    return Object.fromEntries(Object.entries(defaults).map(([resource, fallback]) => {
        const raw = env[envKeys[resource as AccountQuotaResource]];
        const parsed = raw === undefined ? NaN : Number(raw);
        const value = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 1_000_000_000 ? parsed : fallback;
        return [resource, value];
    })) as AccountQuotas;
}

export class AccountQuotaError extends Error {
    readonly name = 'AccountQuotaError';

    constructor(readonly resource: AccountQuotaResource, readonly limit: number) {
        super(`Account ${resource} quota exceeded (${limit})`);
    }
}

export async function createWithinAccountQuota<T>(options: {
    resource: AccountQuotaResource;
    limit: number;
    count: (tx: Tx) => Promise<number>;
    create: (tx: Tx) => Promise<T>;
}): Promise<T> {
    return inTx(async (tx) => {
        if (await options.count(tx) >= options.limit) {
            throw new AccountQuotaError(options.resource, options.limit);
        }
        return options.create(tx);
    });
}
