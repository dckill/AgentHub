import type { AccountRequest } from './accountLifecycle';
import {
    runSettingsSyncApplication,
    type SettingsSyncApplicationParams,
} from './settingsSyncApplication';

export type SettingsSyncLifecycleOptions = Omit<
    SettingsSyncApplicationParams<AccountRequest>,
    'runRequest'
> & {
    generation: number;
    runRequest: <T>(
        generation: number,
        operation: (request: AccountRequest) => Promise<T>,
    ) => Promise<T>;
};

/** Bind settings synchronization to one account generation. */
export async function runSettingsSyncLifecycle(
    options: SettingsSyncLifecycleOptions,
): Promise<void> {
    const { generation, runRequest, ...application } = options;
    await runSettingsSyncApplication<AccountRequest>({
        ...application,
        runRequest: (operation) => runRequest(generation, operation),
    });
}
