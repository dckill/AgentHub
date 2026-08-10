export type PushTokenRegistrationResult = {
    registered: boolean;
    token: string | null;
    permission: {
        status: string;
        granted: boolean;
        canAskAgain?: boolean;
    };
};

export type PushTokenRegistrationApplicationParams = {
    runRequest: (operation: (signal: AbortSignal) => Promise<PushTokenRegistrationResult>) => Promise<PushTokenRegistrationResult>;
    syncPushToken: (signal: AbortSignal) => Promise<PushTokenRegistrationResult>;
    log: (message: string) => void;
    warn: (message: string) => void;
};

/** Register the current device token within the account lifecycle and keep the existing fail-soft UI behavior. */
export async function runPushTokenRegistrationApplication(
    params: PushTokenRegistrationApplicationParams,
): Promise<void> {
    try {
        const result = await params.runRequest((signal) => params.syncPushToken(signal));
        params.log('Push token sync result: ' + JSON.stringify({
            registered: result.registered,
            hasToken: !!result.token,
            permission: result.permission.status,
        }));
        if (!result.permission.granted) {
            params.warn('Failed to get push token for push notification!');
        }
    } catch (error) {
        params.log('Failed to register push token: ' + JSON.stringify(error));
    }
}
