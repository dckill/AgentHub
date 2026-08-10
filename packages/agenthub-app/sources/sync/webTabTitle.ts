type EventTargetLike = {
    addEventListener: (event: string, listener: () => void) => void;
    removeEventListener: (event: string, listener: () => void) => void;
};

export type WebTabTitleEnvironment = {
    platform?: string;
    document?: EventTargetLike & {
        title: string;
        visibilityState: string;
        hasFocus?: () => boolean;
    };
    window?: EventTargetLike;
};

export type WebTabTitleController = {
    notifyUnreadMessage: () => void;
    dispose: () => void;
};

function createNoopController(): WebTabTitleController {
    return {
        notifyUnreadMessage: () => undefined,
        dispose: () => undefined,
    };
}

/** Keep a small, browser-only unread counter without changing native UI state. */
export function createWebTabTitleController(environment: WebTabTitleEnvironment): WebTabTitleController {
    const document = environment.document;
    const window = environment.window;
    if ((environment.platform ?? 'web') !== 'web' || !document || !window) {
        return createNoopController();
    }

    let unreadCount = 0;
    let disposed = false;

    const isVisible = () => {
        const visible = document.visibilityState === 'visible';
        const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
        return visible && focused;
    };
    const applyTitle = () => {
        const stripped = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = unreadCount > 0 ? `(${unreadCount}) ${stripped}` : stripped;
    };
    const reset = () => {
        if (!disposed && isVisible() && unreadCount !== 0) {
            unreadCount = 0;
            applyTitle();
        }
    };

    document.addEventListener('visibilitychange', reset);
    window.addEventListener('focus', reset);

    return {
        notifyUnreadMessage: () => {
            if (disposed || isVisible()) {
                return;
            }
            unreadCount += 1;
            applyTitle();
        },
        dispose: () => {
            if (disposed) return;
            disposed = true;
            document.removeEventListener('visibilitychange', reset);
            window.removeEventListener('focus', reset);
        },
    };
}

let defaultController: WebTabTitleController | null = null;

/** Notify the real browser tab; native platforms intentionally do nothing. */
export function notifyUnreadMessage(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
        return;
    }
    defaultController ??= createWebTabTitleController({ platform: 'web', document, window });
    defaultController.notifyUnreadMessage();
}
