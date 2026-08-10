import type { AppStateStatus } from 'react-native';

export type AppStateSubscription = {
    remove: () => void;
};

export type AddAppStateListener = (
    event: 'change',
    listener: (state: AppStateStatus) => void,
) => AppStateSubscription;

/** Register an AppState listener and make cleanup idempotent for account teardown. */
export function subscribeAppStateListener(
    addEventListener: AddAppStateListener,
    listener: (state: AppStateStatus) => void,
): () => void {
    const subscription = addEventListener('change', listener);
    let active = true;
    return () => {
        if (!active) return;
        active = false;
        subscription.remove();
    };
}
