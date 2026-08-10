import type { ApiEphemeralActivityUpdate } from './apiTypes';
import {
    applyActivityFlush,
    type ActivityFlushApplicationParams,
} from './activityFlushApplication';

export type ActivityFlushLifecycleOptions = {
    updates: Map<string, ApiEphemeralActivityUpdate>;
    getSessions: () => ActivityFlushApplicationParams['sessions'];
    applySessions: ActivityFlushApplicationParams['applySessions'];
    apply?: typeof applyActivityFlush;
};

/** Bind the current storage snapshot to the pure activity flush application. */
export function runActivityFlushLifecycle(options: ActivityFlushLifecycleOptions): number {
    const apply = options.apply ?? applyActivityFlush;
    return apply({
        updates: options.updates,
        sessions: options.getSessions(),
        applySessions: options.applySessions,
    });
}
