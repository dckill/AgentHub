import type { InvalidateSync } from '@/utils/sync';

type StoppableSync = Pick<InvalidateSync, 'stop'>;

export type StopAccountSyncsOptions = {
    cancelRealtimeSubscriptions: (() => void) | null;
    clearRealtimeSubscriptions: () => void;
    accountSyncs: readonly StoppableSync[];
    keyedSyncs: Iterable<StoppableSync>;
};

export function stopAccountSyncs(options: StopAccountSyncsOptions): void {
    options.cancelRealtimeSubscriptions?.();
    options.clearRealtimeSubscriptions();
    for (const sync of [...options.accountSyncs, ...options.keyedSyncs]) {
        sync.stop();
    }
}
