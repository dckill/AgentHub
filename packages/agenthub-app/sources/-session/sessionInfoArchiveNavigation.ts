interface SessionInfoArchiveRouter {
    replace: (href: '/') => void;
}

interface SessionInfoDeleteRouter extends SessionInfoArchiveRouter {
    canDismiss?: () => boolean;
    dismissAll?: () => void;
}

const DEFAULT_ARCHIVE_NAVIGATION_DELAY_MS = 50;
const SUCCESSFUL_RUNNER_EXIT_FEEDBACK_DELAY_MS = 1_000;
const ABNORMAL_TERMINAL_FEEDBACK_DELAY_MS = 1_500;

export function getArchiveFeedbackNavigationDelayMs(state: string): number {
    if (state === 'timeout' || state === 'not-found') {
        return ABNORMAL_TERMINAL_FEEDBACK_DELAY_MS;
    }
    if (state === 'exited') {
        return SUCCESSFUL_RUNNER_EXIT_FEEDBACK_DELAY_MS;
    }
    return DEFAULT_ARCHIVE_NAVIGATION_DELAY_MS;
}

/**
 * Navigate to home after archiving a session.
 *
 * IMPORTANT: This function includes a delay to prevent a React Native Fabric crash.
 * The crash occurs when navigating away while the UI is still rendering. The Fabric
 * renderer attempts to add a view that already has a parent during the transition.
 *
 * Root cause: When router.replace('/') is called immediately after updating session state,
 * there's a race condition between the navigation and the Fabric UI thread. The batched
 * mount items from the state update haven't fully completed when navigation starts,
 * causing "addViewAt: cannot insert view: View already has a parent" errors.
 *
 * The fix: Delay navigation to allow the Fabric UI thread to complete its batched operations.
 */
export function navigateAfterSessionArchive(router: SessionInfoArchiveRouter, delayMs: number = DEFAULT_ARCHIVE_NAVIGATION_DELAY_MS) {
    // Use setTimeout to allow Fabric to complete its batched mount operations
    // This prevents the race condition between navigation and UI rendering
    setTimeout(() => {
        router.replace('/');
    }, delayMs);
}

/**
 * Navigate away after permanently deleting the current session.
 *
 * Deleting from `/session/:id/info` can leave `/session/:id` underneath the info
 * route in the native stack. Clear that stack before removing local session state
 * so Fabric does not try to reattach a Screen for a session that just disappeared.
 */
export function navigateAfterSessionDelete(
    router: SessionInfoDeleteRouter,
    deleteLocalSession: () => void,
    delayMs: number = DEFAULT_ARCHIVE_NAVIGATION_DELAY_MS,
) {
    setTimeout(() => {
        if (router.canDismiss?.()) {
            router.dismissAll?.();
        }
        router.replace('/');

        setTimeout(() => {
            deleteLocalSession();
        }, delayMs);
    }, delayMs);
}
