export type CodexNotificationRoute = 'legacy' | 'raw' | 'lifecycle';

export type RouteCodexNotificationParams = {
    method: string;
    params: unknown;
    handleLegacy: () => boolean;
    handleRaw: () => boolean;
    handleLifecycle: () => boolean;
    setLegacyProtocol: () => void;
    logRaw: (method: string) => void;
};

/** Preserve the notification protocol precedence: legacy, then raw, then v2 lifecycle fallback. */
export function routeCodexNotification(params: RouteCodexNotificationParams): CodexNotificationRoute {
    if (params.handleLegacy()) {
        params.setLegacyProtocol();
        return 'legacy';
    }
    if (params.handleRaw()) {
        params.logRaw(params.method);
        return 'raw';
    }
    params.handleLifecycle();
    return 'lifecycle';
}
