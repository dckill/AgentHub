import type { AuthCredentials } from '@/auth/tokenStorage';
import type { AccountRequest } from './accountLifecycle';
import { runProfileFetchApplication } from './profileFetchApplication';
import type { Profile } from './profile';

export type ProfileSyncOptions = {
    generation: number;
    credentials: AuthCredentials;
    runRequest: <T>(
        generation: number,
        operation: (request: AccountRequest) => Promise<T>,
    ) => Promise<T>;
    fetchProfile: (credentials: AuthCredentials, signal: AbortSignal) => Promise<unknown>;
    assertCurrent: () => void;
    applyProfile: (profile: Profile) => void;
};

/** Bind profile transport and projection to the current account generation. */
export async function runProfileSync(options: ProfileSyncOptions): Promise<Profile> {
    return runProfileFetchApplication({
        runRequest: (operation) => options.runRequest(options.generation, operation),
        fetchProfile: (signal) => options.fetchProfile(options.credentials, signal),
        assertCurrent: options.assertCurrent,
        applyProfile: options.applyProfile,
    });
}
