import type { AuthCredentials } from '@/auth/tokenStorage';
import type { AccountRequest } from './accountLifecycle';
import {
    runPushTokenRegistrationApplication,
    type PushTokenRegistrationResult,
} from './pushTokenRegistrationApplication';

export type PushTokenSyncOptions = {
    generation: number;
    credentials: AuthCredentials;
    runRequest: <T>(
        generation: number,
        operation: (request: AccountRequest) => Promise<T>,
    ) => Promise<T>;
    syncPushToken: (credentials: AuthCredentials, signal: AbortSignal) => Promise<PushTokenRegistrationResult>;
    log: (message: string) => void;
    warn: (message: string) => void;
};

/** Bind push-token registration to the account generation while preserving fail-soft behavior. */
export async function runPushTokenSync(options: PushTokenSyncOptions): Promise<void> {
    await runPushTokenRegistrationApplication({
        runRequest: (operation) => options.runRequest(
            options.generation,
            (request) => operation(request.signal),
        ),
        syncPushToken: (signal) => options.syncPushToken(options.credentials, signal),
        log: options.log,
        warn: options.warn,
    });
}
