import type { AccountRequest } from './accountLifecycle';
import { runNativeUpdateFetchApplication } from './nativeUpdateFetchApplication';
import type { NativeUpdateStatus } from './nativeUpdateResponse';

type NativeUpdateRequest = {
    signal: AbortSignal;
    assertCurrent: () => void;
};

export type NativeUpdateSyncOptions = {
    generation: number;
    platform: string;
    version?: string | null;
    appId?: string | null;
    runRequest: <T>(
        generation: number,
        operation: (request: AccountRequest) => Promise<T>,
    ) => Promise<T>;
    fetchUpdate: (request: AccountRequest) => Promise<NativeUpdateStatus | null>;
    assertCurrent: () => void;
    isCurrent: () => boolean;
    applyStatus: (status: NativeUpdateStatus | null) => void;
    reportError: (error: unknown) => void;
};

/** Gate native update checks by platform identity and keep account errors fail-soft. */
export async function runNativeUpdateSync(options: NativeUpdateSyncOptions): Promise<void> {
    if ((options.platform !== 'android' && options.platform !== 'ios') || !options.version || !options.appId) {
        return;
    }

    try {
        await runNativeUpdateFetchApplication<AccountRequest, NativeUpdateStatus>({
            runRequest: (operation) => options.runRequest(options.generation, operation),
            fetchUpdate: options.fetchUpdate,
            assertCurrent: options.assertCurrent,
            isCurrent: options.isCurrent,
            applyStatus: options.applyStatus,
            reportError: options.reportError,
        });
    } catch (error) {
        if (options.isCurrent()) {
            options.reportError(error);
            options.applyStatus(null);
        }
    }
}
