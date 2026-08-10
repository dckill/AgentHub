import type { PushToken } from '@/sync/apiPush';
import type { PushPermissionInfo } from '@/sync/pushRegistration';

export type PushSettingsLoadResult = {
    tokens: PushToken[];
    permission: PushPermissionInfo;
    currentToken: string | null;
};

/** Load account push settings without projecting a response after its account is stale. */
export async function runPushSettingsLoad(options: {
    fetchTokens: () => Promise<PushToken[]>;
    getPermission: () => Promise<PushPermissionInfo>;
    getCurrentToken: () => Promise<string | null>;
    isCurrent: () => boolean;
    apply: (result: PushSettingsLoadResult) => void;
    setLoading: (loading: boolean) => void;
    onError?: (error: unknown) => void;
}): Promise<boolean> {
    if (!options.isCurrent()) {
        return false;
    }

    options.setLoading(true);
    try {
        const [tokens, permission, currentToken] = await Promise.all([
            options.fetchTokens(),
            options.getPermission(),
            options.getCurrentToken(),
        ]);
        if (!options.isCurrent()) {
            return false;
        }
        options.apply({ tokens, permission, currentToken });
        return true;
    } catch (error) {
        if (options.isCurrent()) {
            options.onError?.(error);
        }
        return false;
    } finally {
        if (options.isCurrent()) {
            options.setLoading(false);
        }
    }
}
