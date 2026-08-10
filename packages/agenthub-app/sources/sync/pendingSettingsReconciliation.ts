import type { Settings } from './settings';

/** Keep local setting changes made after a request snapshot was sent. */
export function retainConcurrentPendingSettings(
    sentPending: Partial<Settings>,
    currentPending: Partial<Settings>,
): Partial<Settings> {
    const retained: Partial<Settings> = {};
    for (const key of Object.keys(currentPending) as (keyof Settings)[]) {
        if (!(key in sentPending) || currentPending[key] !== sentPending[key]) {
            (retained as Record<string, unknown>)[key] = currentPending[key];
        }
    }
    return retained;
}
