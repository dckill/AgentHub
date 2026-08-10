import type { ApiUpdate } from './apiTypes';
import type { Profile } from './profile';

type AccountUpdate = Extract<ApiUpdate, { t: 'update-account' }>;

/** Project an account update onto the locally stored profile. */
export function buildUpdatedProfile(
    current: Profile,
    accountUpdate: AccountUpdate,
    timestamp: number,
): Profile {
    return {
        ...current,
        firstName: accountUpdate.firstName !== undefined ? accountUpdate.firstName : current.firstName,
        lastName: accountUpdate.lastName !== undefined ? accountUpdate.lastName : current.lastName,
        avatar: accountUpdate.avatar !== undefined ? accountUpdate.avatar : current.avatar,
        timestamp,
    };
}
