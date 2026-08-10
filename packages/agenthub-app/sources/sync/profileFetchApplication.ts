import type { AccountRequest } from './accountLifecycle';
import { profileParse, type Profile } from './profile';

export type ProfileFetchApplicationParams = {
    runRequest: <T>(operation: (request: AccountRequest) => Promise<T>) => Promise<T>;
    fetchProfile: (signal: AbortSignal) => Promise<unknown>;
    assertCurrent: () => void;
    applyProfile: (profile: Profile) => void;
};

/** Keep profile transport parsing and stale-account application in one testable boundary. */
export async function runProfileFetchApplication(
    params: ProfileFetchApplicationParams,
): Promise<Profile> {
    const parsedProfile = await params.runRequest(async (request) => {
        const response = await params.fetchProfile(request.signal);
        return profileParse(response);
    });

    params.assertCurrent();
    params.applyProfile(parsedProfile);
    return parsedProfile;
}
